import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDef, mapPortsToDrivers, traceToRegisterCell } from '../src/utils/DefReader.js';

// A miniature DEF shaped like an OpenLane run: two output bits, each behind an
// output buffer, one of them behind an extra delay cell, so the trace has to walk
// back through cells that do not hold state.
const DEF = `
VERSION 5.8 ;
DIVIDERCHAR "/" ;
DESIGN mini ;
UNITS DISTANCE MICRONS 1000 ;
DIEAREA ( 0 0 ) ( 20000 20000 ) ;
COMPONENTS 5 ;
    - buf_a sky130_fd_sc_hd__buf_2 + PLACED ( 1000 5000 ) N ;
    - dff_0 sky130_fd_sc_hd__dfrtp_1 + PLACED ( 2000 6000 ) FN ;
    - buf_b sky130_fd_sc_hd__buf_2 + PLACED ( 3000 7000 ) S ;
    - dly_0 sky130_fd_sc_hd__dlymetal6s2s_1 + PLACED ( 4000 8000 ) N ;
    - dff_1 sky130_fd_sc_hd__dfrtp_1 + PLACED ( 5000 9000 ) E ;
END COMPONENTS
PINS 2 ;
    - count[0] + NET count[0] + DIRECTION OUTPUT + USE SIGNAL
      + PORT
        + PLACED ( 19000 100 ) N ;
    - count[1] + NET count[1] + DIRECTION OUTPUT + USE SIGNAL
      + PORT
        + PLACED ( 19000 200 ) N ;
END PINS
NETS 3 ;
    - count[0] ( buf_a X ) ( PIN count[0] ) + USE SIGNAL
      + ROUTED met1 ( 1000 5000 ) ( * 19000 ) ;
    - q0 ( dff_0 Q ) ( buf_a A ) + USE SIGNAL ;
    - count[1] ( buf_b X ) ( PIN count[1] ) + USE SIGNAL
      + ROUTED met1 ( 3000 7000 ) ( * 19000 ) ;
    - q1 ( dly_0 X ) ( buf_b A ) + USE SIGNAL ;
    - q1b ( dff_1 Q ) ( dly_0 A ) + USE SIGNAL ;
END NETS
SPECIALNETS 1 ;
    - VGND ( PIN VGND ) ( * VNB ) + USE GROUND
      + ROUTED met1 480 ( 0 100 ) ( * 19000 ) ;
END SPECIALNETS
END DESIGN
`;

const def = parseDef(DEF);

test('the DEF reader pulls out design metadata, components, pins, and nets', () => {
  assert.equal(def.name, 'mini');
  assert.equal(def.units, 1000);
  assert.deepEqual(def.dieArea, { minX: 0, minY: 0, maxX: 20000, maxY: 20000 });
  assert.equal(def.components.length, 5);
  assert.equal(def.pins.length, 2);
  // Every record must be kept, not just the last one in each section.
  assert.equal(def.nets.length, 5);
  assert.equal(def.specialNets.length, 1);
});

test('components keep their cell type, position, and orientation', () => {
  const dff = def.componentByName.get('dff_1');
  assert.equal(dff.cell, 'sky130_fd_sc_hd__dfrtp_1');
  assert.equal(dff.x, 5000);
  assert.equal(dff.y, 9000);
  assert.equal(dff.orientation, 'E');
});

test('net membership is read from bare "( instance pin )" pairs', () => {
  const net = def.netByName.get('q0');
  assert.deepEqual(
    net.connections.map((connection) => `${connection.kind}:${connection.instance}:${connection.pin}`),
    ['instance:dff_0:Q', 'instance:buf_a:A']
  );
  // A port reference is recognised as such, and a wildcard is not a real sink.
  const port = def.netByName.get('count[0]');
  assert.equal(port.connections[1].kind, 'pin');
  const special = def.specialNets[0];
  assert.equal(special.connections[1].kind, 'wildcard');
});

test('routing layers are collected per net', () => {
  assert.deepEqual(def.netByName.get('count[0]').routing, ['met1']);
});

test('output ports resolve to the instance that drives them', () => {
  const drivers = mapPortsToDrivers(def);
  const count0 = drivers.find((port) => port.port === 'count[0]');
  assert.equal(count0.drivers.length, 1);
  assert.equal(count0.drivers[0].instance, 'buf_a');
  assert.equal(count0.drivers[0].cell, 'sky130_fd_sc_hd__buf_2');
});

test('tracing walks back through buffers and delay cells to the flip-flop', () => {
  const simple = traceToRegisterCell(def, 'count[0]');
  assert.equal(simple.register.instance, 'dff_0', 'one buffer hop reaches the register');
  assert.deepEqual(simple.path.map((step) => step.cell.replace(/^sky130_fd_sc_hd__/, '')), ['buf_2', 'dfrtp_1']);

  const throughDelay = traceToRegisterCell(def, 'count[1]');
  assert.equal(throughDelay.register.instance, 'dff_1');
  assert.deepEqual(
    throughDelay.path.map((step) => step.cell.replace(/^sky130_fd_sc_hd__/, '')),
    ['buf_2', 'dlymetal6s2s_1', 'dfrtp_1'],
    'a dly* delay line holds no state, so the trace continues past it'
  );
});

test('tracing reports no register rather than guessing when there is none', () => {
  assert.equal(traceToRegisterCell(def, 'missing_port'), null);
});

test('each output port traces to a distinct register instance', () => {
  const registers = ['count[0]', 'count[1]'].map((port) => traceToRegisterCell(def, port).register.instance);
  assert.equal(new Set(registers).size, registers.length);
});