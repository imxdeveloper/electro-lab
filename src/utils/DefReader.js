// Minimal DEF reader for Chip View.
//
// An OpenLane / LibreLane run writes a DEF beside the final GDS, and that DEF is
// where the connectivity lives: which placed instance drives which net, which
// pin each top-level port connects to, and where every instance sits. The GDS
// itself has no connectivity, so this is the file that lets simulated signal
// values be mapped onto real layout geometry instead of guessed at.

/** Parse the sections of a DEF that matter for signal mapping. */
export function parseDef(text) {
  const design = {
    name: null,
    units: null,
    dieArea: null,
    components: [],
    pins: [],
    nets: [],
    specialNets: []
  };

  const lines = text.split(/\r?\n/);
  let section = null;
  let current = null;

  const flush = () => {
    if (!current) return;
    if (section === 'components') design.components.push(current);
    else if (section === 'pins') design.pins.push(current);
    else if (section === 'nets') design.nets.push(current);
    else if (section === 'specialNets') design.specialNets.push(current);
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    if (section === null) {
      const header = line.match(/^DESIGN\s+(\S+)/);
      if (header) design.name = header[1];
      const units = line.match(/^UNITS\s+DISTANCE\s+MICRONS\s+(\d+)/);
      if (units) design.units = Number(units[1]);
      const die = line.match(/^DIEAREA\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)\s+\(\s*(-?\d+)\s+(-?\d+)\s*\)/);
      if (die) {
        design.dieArea = {
          minX: Number(die[1]),
          minY: Number(die[2]),
          maxX: Number(die[3]),
          maxY: Number(die[4])
        };
      }
      if (/^COMPONENTS\b/.test(line)) { section = 'components'; continue; }
      if (/^PINS\b/.test(line)) { section = 'pins'; continue; }
      if (/^SPECIALNETS\b/.test(line)) { section = 'specialNets'; continue; }
      if (/^NETS\b/.test(line)) { section = 'nets'; continue; }
      if (/^END\s+(COMPONENTS|PINS|SPECIALNETS|NETS)\b/.test(line)) { section = null; continue; }
      continue;
    }

    if (/^END\s/.test(line)) {
      flush();
      section = null;
      continue;
    }

    // Each record starts with "- name"; everything after it is continuation.
    if (line.startsWith('-')) {
      flush();
      const match = line.match(/^-\s+(\S+)(.*)$/);
      if (!match) continue;
      const [, name, rest] = match;

      if (section === 'components') {
        const cell = rest.trim().split(/\s+/)[0];
        const placed = rest.match(/\+\s*(?:FIXED|PLACED|COVER)\s*\(\s*(-?\d+)\s+(-?\d+)\s*\)\s*([NSEW]|\S+)?/);
        const orient = rest.match(/\)\s*([FNSEW]{1,4})\s*(?:;|$)/);
        current = {
          name,
          cell,
          placed: Boolean(placed),
          x: placed ? Number(placed[1]) : null,
          y: placed ? Number(placed[2]) : null,
          orientation: orient ? orient[1] : null
        };
      } else if (section === 'pins') {
        const net = rest.match(/\+\s*NET\s+(\S+)/);
        const direction = rest.match(/\+\s*DIRECTION\s+(\S+)/);
        current = {
          name,
          net: net ? net[1] : null,
          direction: direction ? direction[1] : null
        };
      } else {
        // DEF writes instance connections as "( instance pin )" with no
        // keyword, ports as "( PIN name )", and wildcards as "( * pin )".
        const connections = [];
        const pair = /\(\s*([^\s()]+)\s+([^\s()]*)\s*\)/g;
        let found = pair.exec(rest);
        while (found) {
          const [, first, second] = found;
          if (first === 'PIN') connections.push({ kind: 'pin', pin: second });
          else if (first === '*') connections.push({ kind: 'wildcard', pin: second });
          else connections.push({ kind: 'instance', instance: first, pin: second || null });
          found = pair.exec(rest);
        }
        current = {
          name,
          connections,
          use: (rest.match(/\+\s*USE\s+(\S+)/) ?? [])[1] ?? null,
          routing: []
        };
      }
      continue;
    }

    // Continuation lines carry routing detail for the current net.
    if (current && (line.startsWith('+') || line.startsWith('NEW'))) {
      const routed = line.match(/\+\s*(?:NEW\s+)?ROUTED\s+(\S+)/);
      if (routed) current.routing.push(routed[1]);
    }
  }
  flush();

  const byName = new Map(design.components.map((component) => [component.name, component]));
  const instanceConnections = new Map();
  for (const net of design.nets) {
    for (const connection of net.connections) {
      if (connection.kind !== 'instance') continue;
      if (!instanceConnections.has(connection.instance)) instanceConnections.set(connection.instance, []);
      instanceConnections.get(connection.instance).push({ net: net.name, pin: connection.pin });
    }
  }

  return {
    ...design,
    componentByName: byName,
    netByName: new Map(design.nets.map((net) => [net.name, net])),
    pinByNet: new Map(
      design.pins.filter((pin) => pin.net).map((pin) => [pin.net, pin])
    ),
    connectionsByInstance: instanceConnections
  };
}

/**
 * Pair every DEF component with the GDS placement that draws it.
 *
 * The two files use different origin conventions. A DEF component's `( x y )` is
 * the placed cell origin in the cell's own frame, while a GDS placement records
 * the translation of a transformed cell: for a rotated or mirrored instance the
 * two differ by the cell's width and height. Comparing the numbers directly only
 * works for unrotated cells, so this matches on geometry instead — the DEF origin
 * has to fall inside the drawn extent of a placement of the same cell type.
 *
 * Every match is reported with how it was established, so callers never have to
 * guess whether a coordinate pair was verified or merely inferred.
 *
 * @param {object} def result of parseDef()
 * @param {Array<{name: string, box: object}>} instances flattened GDS placements
 * @param {object} options tolerance in database units
 * @returns {Map<string, object>} component name -> { instance, confidence, delta }
 */
export function matchComponentsToInstances(def, instances, options = {}) {
  const tolerance = options.tolerance ?? 2;
  const byCell = new Map();
  for (const instance of instances) {
    if (!byCell.has(instance.name)) byCell.set(instance.name, []);
    byCell.get(instance.name).push(instance);
  }

  const matches = new Map();
  const taken = new Set();

  // Exact origin agreement is the strongest evidence, so claim those first and
  // leave the remaining placements for the geometric pass below.
  const pending = [];
  for (const component of def.components) {
    const candidates = byCell.get(component.cell) ?? [];
    const exact = candidates.find((instance) => (
      !taken.has(instance) && component.placed &&
      Math.abs(instance.x - component.x) <= tolerance &&
      Math.abs(instance.y - component.y) <= tolerance
    ));
    if (exact) {
      taken.add(exact);
      matches.set(component.name, { instance: exact, confidence: 'origin', delta: 0 });
    } else {
      pending.push(component);
    }
  }

  for (const component of pending) {
    const candidates = (byCell.get(component.cell) ?? []).filter((instance) => !taken.has(instance));
    const inside = candidates.find((instance) => {
      const box = instance.box;
      if (!box) return false;
      return component.x >= box.minX - tolerance && component.x <= box.maxX + tolerance &&
        component.y >= box.minY - tolerance && component.y <= box.maxY + tolerance;
    });
    if (!inside) continue;
    taken.add(inside);
    matches.set(component.name, {
      instance: inside,
      confidence: 'inside',
      delta: {
        dx: component.x - inside.x,
        dy: component.y - inside.y
      }
    });
  }

  return matches;
}

/**
 * Which placed instance drives each top-level output port.
 *
 * For a register bank, the output net reaches the outside world through one
 * instance pin, and that instance is the physical cell for that bit. Returns the
 * driver per port, with the coordinates a 3D viewer needs.
 *
 * @param {object} def result of parseDef()
 * @param {object} options driverPins pins that count as an output driver
 */
export function mapPortsToDrivers(def, options = {}) {
  const driverPins = new Set(options.driverPins ?? ['Q', 'QN', 'X', 'Y', 'Z', 'ZN']);
  const ports = [...def.pinByNet.keys()];

  const results = [];
  for (const net of ports) {
    const pin = def.pinByNet.get(net);
    const netRecord = def.netByName.get(net);
    if (!netRecord) continue;

    const drivers = [];
    for (const connection of netRecord.connections) {
      if (connection.kind !== 'instance') continue;
      const pinName = (connection.pin ?? '').toUpperCase();
      if (!driverPins.has(pinName)) continue;
      const component = def.componentByName.get(connection.instance);
      if (!component) continue;
      drivers.push({
        instance: connection.instance,
        cell: component.cell,
        pin: connection.pin,
        x: component.x,
        y: component.y,
        orientation: component.orientation
      });
    }

    results.push({
      port: pin.name,
      direction: pin.direction,
      net,
      drivers,
      // Instances on this net that are not the driver (load side).
      loads: netRecord.connections
        .filter((connection) => connection.kind === 'instance')
        .length - drivers.length
    });
  }

  return results;
}

/**
 * Walk back from an output port through simple buffers to the cell that actually
 * holds the state.
 *
 * A port net usually reaches the pad through an output buffer, so the buffer is
 * not the interesting cell; this keeps following input nets until it lands on a
 * sequential cell (a flip-flop or latch by cell name), which is the instance a
 * 3D viewer should light up when that bit changes.
 */
export function traceToRegisterCell(def, portName, options = {}) {
  const maxHops = options.maxHops ?? 6;
  const inputPins = new Set(options.inputPins ?? ['A', 'A1', 'A2', 'B', 'CLK', 'D', 'D0', 'D1', 'SE', 'SI', 'RN', 'SN']);
  // sky130 storage cells are the df* family (dfrtp, dfxtp, dfstp, ...); "dly*"
// cells are delay lines and hold no state, so they must not stop the trace.
const sequential = options.sequential ?? /(?:^|__)df[a-z0-9]*(?:_|$)|(?:^|__)(?:sram|latch|ff)[a-z0-9]*(?:_|$)/i;

  const pin = def.pins.find((entry) => entry.name === portName);
  if (!pin?.net) return null;

  const path = [];
  let netName = pin.net;
  for (let hop = 0; hop < maxHops; hop += 1) {
    const net = def.netByName.get(netName);
    if (!net) break;
    const driver = net.connections.find((connection) => (
      connection.kind === 'instance' && DRIVER_PINS.has(connection.pin)
    ));
    if (!driver) break;
    const component = def.componentByName.get(driver.instance);
    if (!component) break;

    const step = {
      net: netName,
      instance: driver.instance,
      cell: component.cell,
      pin: driver.pin,
      x: component.x,
      y: component.y,
      orientation: component.orientation
    };
    path.push(step);

    // A sequential cell holds the value; stop here.
    if (sequential.test(component.cell)) return { port: portName, register: step, path };

    // Otherwise follow this cell's input pins back to their nets.
    const inputs = (def.connectionsByInstance.get(driver.instance) ?? [])
      .filter((connection) => inputPins.has((connection.pin ?? '').toUpperCase()));
    const nextNet = inputs.find((connection) => def.netByName.get(connection.net));
    if (!nextNet) return { port: portName, register: step, path };
    netName = nextNet.net;
  }
  return { port: portName, register: path[path.length - 1] ?? null, path };
}

const DRIVER_PINS = new Set(['Q', 'QN', 'X', 'Y', 'Z', 'ZN']);