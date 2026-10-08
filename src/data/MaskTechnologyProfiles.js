const layer = (id, label, color, description, stream = null, mask = null, polarity = null) => ({
  id,
  label,
  color,
  description,
  stream,
  mask,
  polarity
});

export const MASK_TECHNOLOGIES = [
  {
    id: 'sky130',
    label: 'SKY130',
    name: 'SkyWater SKY130',
    status: 'Reference layer set · educational preview',
    description: 'Representative drawn layers from the SKY130 open PDK. Stream mapping must come from the selected PDK installation.',
    sourceUrl: 'https://skywater-pdk.readthedocs.io/en/main/rules/layers.html',
    layers: [
      layer('dnwell', 'DNWELL', '#8448ba', 'Deep n-well'),
      layer('nwell', 'NWELL', '#b557ca', 'N-well'),
      layer('diff', 'DIFF', '#d34c58', 'Active diffusion'),
      layer('tap', 'TAP', '#e5804e', 'Substrate or well tap'),
      layer('nsdm', 'NSDM', '#d5b33b', 'N-type source/drain implant'),
      layer('psdm', 'PSDM', '#50b56d', 'P-type source/drain implant'),
      layer('poly', 'POLY', '#f274ad', 'Polysilicon gate and interconnect'),
      layer('li1', 'LI1', '#5dbed0', 'Local interconnect'),
      layer('licon1', 'LICON1', '#d6dce5', 'Local-interconnect contact'),
      layer('mcon', 'MCON', '#b3c2d5', 'Local-interconnect to Metal1 contact'),
      layer('met1', 'MET1', '#4c91e6', 'Metal 1'),
      layer('via', 'VIA', '#a0d9f0', 'Metal1 to Metal2 via'),
      layer('met2', 'MET2', '#d1a44e', 'Metal 2'),
      layer('via2', 'VIA2', '#d9c58a', 'Metal2 to Metal3 via'),
      layer('met3', 'MET3', '#bb694d', 'Metal 3'),
      layer('via3', 'VIA3', '#e5a17b', 'Metal3 to Metal4 via'),
      layer('met4', 'MET4', '#7cab59', 'Metal 4'),
      layer('via4', 'VIA4', '#b4d493', 'Metal4 to Metal5 via'),
      layer('met5', 'MET5', '#8e79d6', 'Metal 5'),
      layer('pad', 'PAD', '#ebd7a1', 'Pad opening')
    ]
  },
  {
    id: 'gf180mcu',
    label: 'GF180MCU',
    name: 'GlobalFoundries GF180MCU',
    status: 'Open PDK experimental preview · not production signoff',
    description: 'Representative drawn layers and stream identifiers from the GF180MCU open PDK design manual; selected process options and full rule decks are not represented.',
    sourceUrl: 'https://gf180mcu-pdk.readthedocs.io/en/latest/physical_verification/design_manual/drm_04_1.html',
    maskSourceUrl: 'https://gf180mcu-pdk.readthedocs.io/en/latest/physical_verification/design_manual/drm_04_3.html',
    statusSourceUrl: 'https://github.com/google/gf180mcu-pdk',
    layers: [
      layer('comp', 'COMP', '#d34c58', 'Diffusion for device and interconnect', '22/0', '10', 'Chrome'),
      layer('dnwell', 'DNWELL', '#8448ba', 'Deep n-well', '12/0', '6', 'Clear'),
      layer('nwell', 'NWELL', '#b557ca', 'N-well implant', '21/0', '5', 'Clear'),
      layer('lvpwell', 'LVPWELL', '#9a6cc7', 'P-well implant', '204/0', '18', 'Chrome'),
      layer('dualgate', 'DUALGATE', '#eea958', '6 V gate oxide', '55/0', '38', 'Chrome'),
      layer('poly2', 'POLY2', '#f274ad', 'Poly2 gate and interconnect', '30/0', '60', 'Chrome'),
      layer('nplus', 'NPLUS', '#d5b33b', 'N+ implant', '32/0', '65', 'Clear'),
      layer('pplus', 'PPLUS', '#50b56d', 'P+ implant', '31/0', '70', 'Clear'),
      layer('sab', 'SAB', '#bf7d54', 'Salicide block', '49/0', '68', 'Chrome'),
      layer('contact', 'CONTACT', '#d6dce5', 'Metal1 to active or Poly2 contact', '33/0', '75', 'Clear'),
      layer('metal1', 'METAL1', '#4c91e6', 'Metal 1 interconnect', '34/0', '80', 'Chrome'),
      layer('via1', 'VIA1', '#a0d9f0', 'Metal1 to Metal2 via', '35/0', '85', 'Clear'),
      layer('metal2', 'METAL2', '#d1a44e', 'Metal 2 interconnect', '36/0', '88', 'Chrome'),
      layer('via2', 'VIA2', '#d9c58a', 'Metal2 to Metal3 via', '38/0', '91', 'Clear'),
      layer('metal3', 'METAL3', '#bb694d', 'Metal 3 interconnect', '42/0', '93', 'Chrome'),
      layer('via3', 'VIA3', '#e5a17b', 'Metal3 to Metal4 via', '40/0', '94', 'Clear'),
      layer('metal4', 'METAL4', '#7cab59', 'Metal 4 interconnect', '46/0', '96', 'Chrome'),
      layer('via4', 'VIA4', '#b4d493', 'Metal4 to Metal5 via', '41/0', '97', 'Clear'),
      layer('metal5', 'METAL5', '#8e79d6', 'Metal 5 interconnect', '81/0', '9E', 'Chrome'),
      layer('via5', 'VIA5', '#c3b2f0', 'Metal5 to Metal6 via', '82/0', '9D', 'Clear'),
      layer('metaltop', 'METALTOP', '#57afa1', 'Top metal interconnect', '53/0', '98', 'Chrome'),
      layer('pad', 'PAD', '#ebd7a1', 'Bond pad opening', '37/0', '95', 'Clear')
    ]
  },
  {
    id: 'generic',
    label: 'Educational',
    name: 'Process-agnostic educational layout',
    status: 'Conceptual layers · not tied to a foundry process',
    description: 'Generic drawing layers for learning. Names, geometry, and rules do not represent a manufacturing process.',
    sourceUrl: null,
    layers: [
      layer('artwork', 'ARTWORK', '#6ca7ed', 'General-purpose drawing layer'),
      layer('active', 'ACTIVE (concept)', '#d34c58', 'Conceptual active region'),
      layer('gate', 'GATE (concept)', '#f274ad', 'Conceptual gate region'),
      layer('metal1', 'METAL 1 (concept)', '#d1a44e', 'Conceptual interconnect'),
      layer('metal2', 'METAL 2 (concept)', '#8e79d6', 'Conceptual upper interconnect')
    ]
  }
];

export const DEFAULT_MASK_TECHNOLOGY_ID = 'generic';
export const MASK_EDITOR_GRID_PITCH_NM = 10;
