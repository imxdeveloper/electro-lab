import { spawn, execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const SUPPORTED_PDKS = new Set(['sky130A', 'sky130B', 'gf180mcuD']);
const MAX_BODY_BYTES = 1_000_000;
const MAX_LOG_CHARS = 60_000;
const PDK_VOLUME = 'electro-eda-pdk-cache-v1';

export function parseModuleName(verilog) {
  const module = verilog.match(/\bmodule\s+([A-Za-z_][A-Za-z0-9_$]*)\s*\(/);
  if (!module || (verilog.match(/\bmodule\b/g) || []).length !== 1 || (verilog.match(/\bendmodule\b/g) || []).length !== 1) {
    throw new Error('Expected one complete Verilog module.');
  }
  return module[1];
}

export function buildOpenLaneConfig({ designName, pdk, widthMm = 1, heightMm = 1 }) {
  if (!SUPPORTED_PDKS.has(pdk)) throw new Error('Choose SKY130A, SKY130B, or GF180MCU D.');
  if (!/^[A-Za-z_][A-Za-z0-9_$]{0,47}$/.test(designName)) throw new Error('Design name must be a valid Verilog module identifier (up to 48 characters).');
  if (![widthMm, heightMm].every((value) => Number.isFinite(value) && value >= 0.01 && value <= 1000)) {
    throw new Error('Die dimensions must be between 0.01 mm and 1000 mm.');
  }
  return {
    DESIGN_NAME: designName,
    VERILOG_FILES: ['dir::design.v'],
    PDK: pdk,
    FP_SIZING: 'absolute',
    CLOCK_PERIOD: 10,
    DIE_AREA: [0, 0, Number((widthMm * 1000).toFixed(3)), Number((heightMm * 1000).toFixed(3))]
  };
}

function sendJson(response, status, data) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request exceeds the 1 MB limit.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Request body must be valid JSON.'); }
}

function findCommand(command) {
  const lookup = process.platform === 'win32' ? 'where.exe' : 'which';
  return new Promise((resolve) => execFile(lookup, [command], { timeout: 1500, windowsHide: true }, (error, stdout) => {
    resolve(error ? null : stdout.trim().split(/\r?\n/)[0] || null);
  }));
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => execFile(command, args, { ...options, windowsHide: true, maxBuffer: 4_000_000 }, (error, stdout, stderr) => {
    if (error) {
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    } else resolve({ stdout, stderr });
  }));
}

async function listFiles(root, filter) {
  const files = [];
  async function walk(folder) {
    let entries;
    try { entries = await readdir(folder, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (filter(entry.name, absolute)) files.push(absolute);
    }
  }
  await walk(root);
  return files;
}

function publicJob(job) {
  return {
    id: job.id, designName: job.designName, pdk: job.pdk, status: job.status,
    startedAt: job.startedAt, finishedAt: job.finishedAt, exitCode: job.exitCode,
    error: job.error, log: job.log.slice(-MAX_LOG_CHARS), artifacts: job.artifacts || []
  };
}

export async function collectJobArtifacts(job, exitCode) {
  job.exitCode = exitCode;
  job.finishedAt = new Date().toISOString();
  const runsRoot = path.join(job.folder, 'runs');
  const runEntries = await readdir(runsRoot, { withFileTypes: true }).catch(() => []);
  const runFolders = runEntries.filter((entry) => entry.isDirectory() && entry.name.startsWith('RUN_')).map((entry) => entry.name).sort();
  const runRoot = path.join(runsRoot, runFolders.at(-1) || '');
  const gdsFiles = await listFiles(path.join(runRoot, 'final', 'gds'), (name) => name.toLowerCase().endsWith('.gds'));
  const selectedReports = new Set([
    'antenna_summary.rpt', 'chk.rpt', 'drc_violations.magic.rpt', 'lvs.netgen.rpt',
    'manufacturability.rpt', 'stat.rpt', 'summary.rpt', 'wire_lengths.csv'
  ]);
  const reportFiles = await listFiles(runRoot, (name, file) => selectedReports.has(name.toLowerCase()) ||
    path.relative(runRoot, file).split(path.sep).length === 1 && /^(flow|error|warning)\.log$|^resolved\.json$/i.test(name));
  const reportsByName = new Map(reportFiles.map((file) => [path.basename(file).toLowerCase(), file]));
  const reports = [...reportsByName.values()];
  const paths = new Map();
  for (const file of gdsFiles) paths.set(`gds-${paths.size}`, { file, type: 'application/octet-stream', name: path.basename(file), kind: 'gds' });
  for (const file of reports) paths.set(`report-${paths.size}`, { file, type: 'text/plain; charset=utf-8', name: path.basename(file), kind: 'report' });
  job.filePaths = paths;
  job.artifacts = [...paths].map(([key, artifact]) => ({ id: key, name: artifact.name, kind: artifact.kind, url: `/api/eda/jobs/${job.id}/files/${key}` }));
  job.status = exitCode === 0 && gdsFiles.length ? 'succeeded' : 'failed';
  if (exitCode === 0 && !gdsFiles.length) job.error = 'OpenLane exited successfully but no GDS file was found in its run output.';
  else if (exitCode !== 0) job.error ||= `OpenLane exited with code ${exitCode ?? 'unknown'}. Review the run log and reports.`;
}

async function runDockerJob(job, dockerCommand, image, pdkRoot) {
  const volumeName = `electro-eda-${job.id}`;
  const containerName = `electro-eda-${job.id}`;
  let containerCreated = false;
  try {
    await execFileAsync(dockerCommand, ['volume', 'create', PDK_VOLUME]);
    await execFileAsync(dockerCommand, [
      'run', '--rm', '--mount', `type=volume,source=${PDK_VOLUME},target=/root/.volare`,
      '--mount', `type=bind,source=${pdkRoot},target=/host-pdk,readonly`,
      image, 'sh', '-c', 'if [ ! -f /root/.volare/.host-pdk-seeded ]; then cp -a /host-pdk/. /root/.volare/ && touch /root/.volare/.host-pdk-seeded; fi'
    ]);
    await execFileAsync(dockerCommand, ['volume', 'create', volumeName]);
    await execFileAsync(dockerCommand, [
      'create', '--name', containerName,
      '--mount', `type=volume,source=${volumeName},target=/design`,
      '--mount', `type=volume,source=${PDK_VOLUME},target=/root/.volare`,
      '--workdir', '/design', '--env', `PDK=${job.pdk}`, '--env', 'PDK_ROOT=/root/.volare',
      image, 'openlane', '--flow', 'Classic', '/design/config.json'
    ]);
    containerCreated = true;
    await execFileAsync(dockerCommand, ['cp', path.join(job.folder, 'design.v'), `${containerName}:/design/design.v`]);
    await execFileAsync(dockerCommand, ['cp', path.join(job.folder, 'config.json'), `${containerName}:/design/config.json`]);
    job.status = 'running';
    const child = spawn(dockerCommand, ['start', '--attach', containerName], { windowsHide: true, shell: false });
    const append = (chunk) => { job.log = `${job.log}${chunk.toString('utf8')}`.slice(-MAX_LOG_CHARS); };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    try {
      await execFileAsync(dockerCommand, ['cp', `${containerName}:/design/runs`, job.folder]);
    } catch (error) {
      job.log = `${job.log}\nCould not copy the OpenLane run directory from its Docker volume: ${error.message}`.slice(-MAX_LOG_CHARS);
    }
    await collectJobArtifacts(job, exitCode);
  } catch (error) {
    job.status = 'failed';
    job.error = `Docker/OpenLane runner failed: ${error.message}`;
    job.log = `${job.log}\n${error.stderr || error.stdout || ''}`.slice(-MAX_LOG_CHARS);
    job.exitCode = error.code ?? null;
    job.finishedAt = new Date().toISOString();
  } finally {
    if (containerCreated) await execFileAsync(dockerCommand, ['rm', '-f', containerName]).catch(() => {});
    await execFileAsync(dockerCommand, ['volume', 'rm', '-f', volumeName]).catch(() => {});
  }
}

function runNativeJob(job, command, pdk, designName) {
  const child = spawn(command, ['--flow', 'Classic', path.join(job.folder, 'config.json')], {
    cwd: job.folder, windowsHide: true, shell: false,
    env: { ...process.env, PDK: pdk, DESIGN_NAME: designName }
  });
  job.status = 'running';
  const append = (chunk) => { job.log = `${job.log}${chunk.toString('utf8')}`.slice(-MAX_LOG_CHARS); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (error) => { job.error = `Could not start OpenLane: ${error.message}`; });
  child.on('close', (code) => collectJobArtifacts(job, code).catch((error) => {
    job.status = 'failed'; job.error = `Could not collect OpenLane results: ${error.message}`; job.finishedAt = new Date().toISOString();
  }));
}

export function createEdaPlugin() {
  const jobs = new Map();
  const jobRoot = process.env.ELECTRO_EDA_JOBS_DIR || path.join(os.tmpdir(), 'electro-designer-eda-jobs');
  const openlaneCommand = process.env.ELECTRO_OPENLANE_BIN || 'openlane';
  const openlaneImage = process.env.ELECTRO_OPENLANE_IMAGE || 'ghcr.io/efabless/openlane2:2.3.10';
  const pdkRoot = process.env.PDK_ROOT || path.join(os.homedir(), '.volare');
  return {
    name: 'electro-local-openlane-runner',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        if (!pathname.startsWith('/api/eda/')) return next();
        try {
          if (pathname === '/api/eda/status' && request.method === 'GET') {
            const [openlane, yosys, openroad, klayout, magic, docker, wsl] = await Promise.all(
              ['openlane', 'yosys', 'openroad', 'klayout', 'magic', 'docker', 'wsl'].map(findCommand));
            const configuredCommand = await findCommand(openlaneCommand);
            const useDocker = !configuredCommand && Boolean(docker);
            sendJson(response, 200, {
              runnerReady: Boolean(configuredCommand || docker),
              runner: configuredCommand
                ? { command: openlaneCommand, path: configuredCommand, mode: 'OpenLane CLI' }
                : useDocker ? { command: docker, image: openlaneImage, mode: 'Docker image' } : null,
              pdkRoot,
              tools: { openlane, yosys, openroad, klayout, magic, docker, wsl }
            });
            return;
          }
          if (pathname === '/api/eda/jobs' && request.method === 'POST') {
            const input = await readJsonBody(request);
            if (typeof input.verilog !== 'string' || input.verilog.length > 900_000) throw new Error('A Verilog module up to 900 KB is required.');
            const designName = parseModuleName(input.verilog);
            const pdk = input.pdk;
            const config = buildOpenLaneConfig({ designName, pdk, widthMm: Number(input.widthMm), heightMm: Number(input.heightMm) });
            const command = await findCommand(openlaneCommand);
            const docker = command ? null : await findCommand('docker');
            if (!command && !docker) {
              sendJson(response, 503, { error: `OpenLane CLI and Docker are unavailable. Install OpenLane 2 or Docker, or set ELECTRO_OPENLANE_BIN before starting the app.` });
              return;
            }
            if ([...jobs.values()].some((job) => job.status === 'running' || job.status === 'queued')) {
              sendJson(response, 409, { error: 'An OpenLane job is already running. Wait for it to finish before starting another.' });
              return;
            }
            const id = randomUUID();
            const folder = path.join(jobRoot, id);
            await mkdir(folder, { recursive: true });
            await mkdir(pdkRoot, { recursive: true });
            await writeFile(path.join(folder, 'design.v'), input.verilog, 'utf8');
            await writeFile(path.join(folder, 'config.json'), JSON.stringify(config, null, 2), 'utf8');
            const job = { id, folder, designName, pdk, status: 'queued', startedAt: new Date().toISOString(), log: '', artifacts: [], runner: command ? openlaneCommand : 'Docker' };
            jobs.set(id, job);
            if (command) runNativeJob(job, openlaneCommand, pdk, designName);
            else runDockerJob(job, docker, openlaneImage, pdkRoot);
            sendJson(response, 202, publicJob(job));
            return;
          }
          const jobMatch = pathname.match(/^\/api\/eda\/jobs\/([0-9a-f-]{36})(?:\/files\/([a-z0-9-]+))?$/i);
          if (jobMatch && request.method === 'GET') {
            const job = jobs.get(jobMatch[1]);
            if (!job) { sendJson(response, 404, { error: 'EDA job not found in this app session.' }); return; }
            if (!jobMatch[2]) { sendJson(response, 200, publicJob(job)); return; }
            const artifact = job.filePaths?.get(jobMatch[2]);
            if (!artifact) { sendJson(response, 404, { error: 'EDA artifact not found.' }); return; }
            await access(artifact.file);
            response.statusCode = 200;
            response.setHeader('Content-Type', artifact.type);
            response.setHeader('Content-Disposition', `attachment; filename="${artifact.name.replace(/["\r\n]/g, '_')}"`);
            createReadStream(artifact.file).pipe(response);
            return;
          }
          sendJson(response, 404, { error: 'Unknown EDA API route.' });
        } catch (error) {
          sendJson(response, 400, { error: error.message || 'EDA request failed.' });
        }
      });
    }
  };
}
