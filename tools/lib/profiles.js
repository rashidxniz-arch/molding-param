// Brand profiles: which fields each EXZONE form has, where they sit on the form,
// their tolerance, and which machine screen (photo) each value is read from.
// tol: ['abs', n] = ± n in the field's unit, ['rel', n] = ± n % of the value, null = no tolerance.
// Per the forms: "Tolerance valid until minimum value equal 0" -> the lower limit never goes below 0.

const f = (k, label, unit, tol, cell, extra = {}) => ({ k, label, unit, tol, cell, ...extra });

// ---------- Header fields shared by every brand (typed or picked, not photographed) ----------
const HEADER_GROUPS = [
  { id: 'part', title: 'Part & mould', fields: [
    f('customer', 'Customer', '', null), f('doc_no', 'Doc #', '', null),
    f('mould_code', 'Mould code', '', null), f('part_name', 'Part name', '', null),
    f('part_no', 'Part no.', '', null), f('cavities', 'No. of cav.', '', null),
    f('runner_wt', 'Runner wt.', 'g', null), f('part_wt', 'Part wt.', 'g', null),
  ]},
  { id: 'material', title: 'Material', fields: [
    f('material', 'Name / grade', '', null), f('colour', 'Colour', '', null),
    f('dry_temp', 'Dry temp.', '°C', ['abs', 10]), f('dry_time', 'Dry time', 'hrs', null),
    f('g_seal', 'G. seal time', 's', null),
  ]},
  { id: 'reference', title: 'Reference values', fields: [
    f('cycle_time', 'Cycle time', 's', null), f('fill_time', 'Fill time', 's', null),
    f('plast_time', 'Plast. time', 's', null), f('cushion', 'Cushion pos.', 'mm', null),
    f('nozzle', 'Nozzle (S / L)', '', null, null, { options: ['S', 'L'] }),
  ]},
  { id: 'mouldtemp', title: 'Mould temp. controller', fields: [
    f('core_sv', 'Core SV', '°C', ['abs', 5]), f('core_av', 'Core AV after 40 shots', '°C', null),
    f('cav_sv', 'Cavity SV', '°C', ['abs', 5]), f('cav_av', 'Cavity AV after 40 shots', '°C', null),
  ]},
  { id: 'aux', title: 'Moulding auxiliary', fields: [
    f('aux_slider', 'Slider', '', null, null, { options: ['Yes', 'No'] }),
    f('aux_robot', 'Robot arm', '', null, null, { options: ['Yes', 'No'] }),
    f('aux_ejls', 'Ejector limit switch', '', null, null, { options: ['Yes', 'No'] }),
    f('water', 'Cooling water', '', null, null, { options: ['Normal water (N)', 'Hot water (H.W)', 'Chiller (C)', 'Hot oil (H.O)', 'Air (A)'] }),
    f('remarks', 'Remarks', '', null),
  ]},
];

// ---------------------------------- NISSEI (MSU-009-01) ----------------------------------
const nissei = {
  brand: 'NISSEI', form: 'MSU-009-01', template: 'MSU-009-01.xlsx',
  title: 'Standard Moulding Parameter ( NISSEI )',
  headerCells: {
    customer: 'F3', machine_no: 'F4', tonnage: 'S4', date: 'AB4',
    mould_code: 'F6', part_name: 'F7', part_no: 'F8', runner_wt: 'F9', part_wt: 'F10', cavities: 'F11',
    material: 'U6', colour: 'U7', dry_temp: 'U8', dry_time: 'U9', g_seal: 'U10',
    cycle_time: 'AF6', fill_time: 'AF7', plast_time: 'AF8', cushion: 'AF9', nozzle: 'AF10',
    core_sv: 'AJ5', core_av: 'AJ7', cav_sv: 'AN5', cav_av: 'AN7',
    set_by: 'AP5', checked_by: 'AQ5', approved_by: 'AR5',
    aux_slider: ['AL35', 'AN35'], aux_robot: ['AL36', 'AN36'], aux_ejls: ['AL37', 'AN37'],
    prod_check: 'AI41', ipqc_confirm: 'AM41',
  },
  // Cells that print a unit/tolerance next to the value (value gets merged into the text)
  headerFormat: { dry_temp: v => `${v} ±10ºC`, dry_time: v => `${v} hrs`, core_sv: v => `SV- ${v} ±5ºC`, cav_sv: v => `SV- ${v} ºC`, core_av: v => `${v} ºC`, cav_av: v => `${v} ºC` },
  sections: [
    { id: 'barrel', title: 'Barrel temperature', fields: [
      f('bt_noz', 'Nozzle', '°C', ['abs', 10], 'B15'),
      f('bt_temp', '“Temp” box (2nd)', '°C', ['abs', 10], 'G15', { note: 'Form has 5 boxes, Nissei screen has 4 zones – confirm what this box is for' }),
      f('bt_front', 'Front', '°C', ['abs', 10], 'L15'),
      f('bt_mid', 'Middle', '°C', ['abs', 10], 'Q15'),
      f('bt_rear', 'Rear', '°C', ['abs', 10], 'V15'),
    ]},
    { id: 'mold', title: 'Mold close / open', fields: [
      f('mc_h1v', 'Close H1 V', '%', ['abs', 10], 'E19'), f('mc_slv', 'Close Slow V', '%', ['abs', 10], 'E20'),
      f('mc_lwp', 'Close LW P', '%', ['abs', 10], 'E21'), f('mc_h1p', 'Close H1 P', '%', ['abs', 10], 'E22'),
      f('mp_1', 'Position (H1 V)', 'mm', ['abs', 10], 'N19'), f('mp_2', 'Position (Slow V)', 'mm', ['abs', 10], 'N20'),
      f('mp_3', 'Position (LW P)', 'mm', ['abs', 10], 'N21'), f('mp_4', 'Position (H1 P)', 'mm', ['abs', 10], 'N22'),
      f('mo_h1v', 'Open H1 V', '%', ['abs', 10], 'Z19'), f('mo_slv', 'Open Slow V', '%', ['abs', 10], 'Z20'),
      f('mo_priv', 'Open PRI V', '%', ['abs', 10], 'Z21'), f('mo_pritm', 'Open PRI TM', 's', ['abs', 10], 'Z22'),
    ]},
    { id: 'inj', title: 'Injection / metering', fields: [
      f('inj_tm', 'Inject TM', 's', ['abs', 10], 'B28'), f('cool_tm', 'Cool TM', 's', ['abs', 10], 'F28'),
      f('tp2', 'TP2', 's', ['abs', 5], 'M28'),
      f('v5', 'V5', '%', ['abs', 10], 'R27'), f('v4', 'V4', '%', ['abs', 10], 'T27'), f('v3', 'V3', '%', ['abs', 10], 'V27'),
      f('v2', 'V2', '%', ['abs', 10], 'X27'), f('v1', 'V1', '%', ['abs', 10], 'Z27'),
      f('s5', 'S5', 'mm', ['abs', 10], 'Q28'), f('s4', 'S4', 'mm', ['abs', 10], 'S28'), f('s3', 'S3', 'mm', ['abs', 10], 'U28'),
      f('s2', 'S2', 'mm', ['abs', 10], 'W28'), f('s1', 'S1', 'mm', ['abs', 10], 'Y28'),
      f('sm', 'SM (metering)', 'mm', ['abs', 10], 'AA28'), f('sd', 'SD (decompress)', 'mm', ['abs', 10], 'AC28'),
      f('p3', 'P3', '%', ['abs', 10], 'B32'), f('p2', 'P2', '%', ['abs', 10], 'E32'), f('p1', 'P1', '%', ['abs', 10], 'H32'),
      f('vs', 'VS (screw speed)', '%', ['abs', 10], 'N32'),
      f('prs_chg', 'PRS change', '', null, 'T32'), f('back_press', 'Back press', '', null, 'Z32'),
    ]},
    { id: 'heater', title: 'Mold heater control setting', fields:
      [1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => f('mh' + n, 'Zone ' + n, '°C', ['abs', 10], ['G36', 'J36', 'M36', 'P36', 'S36', 'V36', 'Y36', 'AB36'][i])) },
  ],
  screens: [
    { id: 'barrel', title: 'Barrel temperature', page: 'BARREL-OIL TEMPERATURE',
      hint: 'Page title “BARREL-OIL TEMPERATURE”. Show the SET and REAL rows for NOZ., FRNT, MID, REAR.',
      read: 'Zones are NOZ. (1), FRNT (2), MID (3), REAR (4); ch5–ch8 are unused unless non-zero. Use the SET row for the values. Also report the REAL row as actuals.',
      fields: ['bt_noz', 'bt_front', 'bt_mid', 'bt_rear'], actuals: ['bt_noz', 'bt_front', 'bt_mid', 'bt_rear'] },
    { id: 'injmtg', title: 'Injection / metering (INJ/MTG.2)', page: 'INJ/MTG.2',
      hint: 'Page with 1:INJECT TM, 2:COOL TM, V5–V1, S5–SD, P3–P1, VS and the monitor line at the bottom.',
      read: 'INJECT TM, COOL TM, V5..V1 (%), TP2 (s), S5..S1, SM, SD (mm), P3, P2, P1 (%), VS (%). From the bottom monitor line: INJ. 1ST PS TM -> fill_time, MTG. TIME -> plast_time, INJ. END POS. -> cushion.',
      fields: ['inj_tm', 'cool_tm', 'v5', 'v4', 'v3', 'v2', 'v1', 'tp2', 's5', 's4', 's3', 's2', 's1', 'sm', 'sd', 'p3', 'p2', 'p1', 'vs', 'fill_time', 'plast_time', 'cushion'] },
    { id: 'mold', title: 'Mold open / close', page: 'MOLD OPEN / CLOSE',
      hint: 'Mold close and mold open page: speeds (V), pressures (P), positions and PRI time.',
      read: 'Mold close: H1 V, Slow V, LW P (low pressure / mould protect), H1 P (high pressure) and the switch position of each. Mold open: H1 V, Slow V, PRI V, PRI TM.',
      fields: ['mc_h1v', 'mc_slv', 'mc_lwp', 'mc_h1p', 'mp_1', 'mp_2', 'mp_3', 'mp_4', 'mo_h1v', 'mo_slv', 'mo_priv', 'mo_pritm'] },
    { id: 'metering', title: 'Back pressure / pressure change', page: 'INJ/MTG.1 or MULTIPRESS',
      hint: 'The page that shows BACK PRESS and the pressure-change (PRS CHANGE) setting.',
      read: 'Back pressure setting and the pressure change (V-P / PRS change) setting.',
      fields: ['back_press', 'prs_chg'] },
    { id: 'heater', title: 'Mold heater / hot runner', page: 'Heater controller',
      hint: 'Mold heater or hot-runner controller showing zone 1–8 set values.',
      read: 'Set temperature of each zone 1..8 (ignore actual values).',
      fields: ['mh1', 'mh2', 'mh3', 'mh4', 'mh5', 'mh6', 'mh7', 'mh8'] },
    { id: 'monitor', title: 'Cycle monitor (optional)', page: 'Monitor',
      hint: 'Any monitor page that shows the actual cycle time.',
      read: 'Actual cycle time in seconds.', fields: ['cycle_time'] },
  ],
  // History Data Sheet (BACK) – one row per approved revision, rows 7..25
  history: { sheet: 'BACK', firstRow: 7, lastRow: 25,
    cols: { A: 'rev', B: 'date', C: 'time', D: 'cavities', E: 'cycle_time',
      F: 'bt_noz', G: 'bt_temp', H: 'bt_front', I: 'bt_mid', J: 'bt_rear',
      L: 's5', M: 's4', N: 's3', O: 's2', P: 's1',
      R: 'v5', S: 'v4', T: 'v3', U: 'v2', V: 'v1', W: 'p1', Y: 'p3', Z: 'p2', AC: 'tp2',
      AE: 'back_press', AG: 'vs', AH: 'sm', AI: 'cool_tm', AJ: 'inj_tm',
      AK: 'changed_by', AL: 'ipqc', AM: 'verification', AN: 'approved_by', AO: 'reason' } },
};

// ---------------------------------- ARBURG (MSU-012-02) ----------------------------------
const steps = (prefix, label, unit, tol, cells) => cells.map((c, i) => f(prefix + (i + 1), `${label} ${i + 1}`, unit, tol, c));
const arburg = {
  brand: 'ARBURG', form: 'MSU-012-02', template: 'MSU-012-02.xlsx',
  title: 'Standard Moulding Parameter (ARBURG)',
  headerCells: {
    customer: 'F2', machine_no: 'F3', tonnage: 'O3', date: 'AJ3',
    mould_code: 'E5', part_name: 'E6', part_no: 'E7', runner_wt: 'E8', part_wt: 'E9', cavities: 'E10',
    material: 'R5', colour: 'R6', dry_temp: 'R7', dry_time: 'R8', g_seal: 'R9',
    cycle_time: 'AK5', fill_time: 'AK6', plast_time: 'AK7', cushion: 'AK8', nozzle: 'AK9',
    core_sv: 'AN4', core_av: 'AN6', cav_sv: 'AR4', cav_av: 'AR6',
    set_by: 'AS4', checked_by: 'AT4', approved_by: 'AU4',
    aux_slider: ['AT46', 'AU46'], aux_robot: ['AT49', 'AU49'], aux_ejls: ['AT51', 'AU51'],
    prod_check: 'AM58', ipqc_confirm: 'AP58',
  },
  headerFormat: { dry_temp: v => `${v} ±10⁰C`, dry_time: v => `${v} Hours`, core_sv: v => `SV- ${v} ±5⁰C`, cav_sv: v => `SV- ${v} ±5⁰C`, core_av: v => `${v} ⁰C`, cav_av: v => `${v} ⁰C` },
  sections: [
    { id: 'clamp', title: 'Mould thickness / clamp', fields: [
      f('thickness', 'Mould thickness', 'mm', null, 'C16'), f('clamp_force', 'Clamp force', 'kN', null, 'H16'),
    ]},
    { id: 'barrel', title: 'Cylinder temperature', fields: [
      f('bt_nh', 'NH (nozzle)', '°C', ['abs', 10], 'N16'), f('bt_h7', 'H7', '°C', ['abs', 10], 'Q16'),
      f('bt_h6', 'H6', '°C', ['abs', 10], 'T16'), f('bt_h5', 'H5', '°C', ['abs', 10], 'W16'),
      f('bt_h4', 'H4', '°C', ['abs', 10], 'Z16'), f('bt_h3', 'H3', '°C', ['abs', 10], 'AC16'),
      f('bt_h2', 'H2', '°C', ['abs', 10], 'AF16'), f('bt_h1', 'H1', '°C', ['abs', 10], 'AI16'),
      f('bt_feed', 'Feed yoke', '°C', ['abs', 10], null, { note: 'No box on the form – printed in Remarks' }),
    ]},
    { id: 'mould', title: 'Mould opening / closing', fields: [
      f('open_end', 'Open end', 'mm', ['abs', 10], 'F20'), f('protect_time', 'Mould protect time', 's', ['abs', 5], 'Q20'),
      f('mo_v4', 'Opening speed 4', 'mm/s', ['rel', 10], 'C23'), f('mo_v3', 'Opening speed 3', 'mm/s', ['rel', 10], 'F23'),
      f('mo_v2', 'Opening speed 2', 'mm/s', ['rel', 10], 'I23'), f('mo_v1', 'Opening speed 1', 'mm/s', ['rel', 10], 'K23'),
      f('mo_s3', 'Opening pos. 3', 'mm', ['abs', 10], 'E24'), f('mo_s2', 'Opening pos. 2', 'mm', ['abs', 10], 'H24'),
      f('mo_s1', 'Opening pos. 1', 'mm', ['abs', 10], 'K24'),
      f('mc_v1', 'Closing speed 1', 'mm/s', ['rel', 10], 'S23'), f('mc_v2', 'Closing speed 2', 'mm/s', ['rel', 10], 'Y23'),
      f('mc_v3', 'Closing speed 3', 'mm/s', ['rel', 10], 'AG23'),
      f('mc_s1', 'Closing pos. 1', 'mm', ['abs', 10], 'T24'), f('mc_s2', 'Closing pos. 2', 'mm', ['abs', 10], 'Z24'),
      f('mc_s3', 'Closing pos. 3', 'mm', ['abs', 10], 'AF24'),
      f('mpp', 'Mould protect pressure (MPP)', 'bar', ['rel', 10], 'AI22'),
    ]},
    { id: 'ejector', title: 'Ejector', fields: [
      f('ej_int', 'Intermediate stop pos.', 'mm', ['abs', 10], 'E29'), f('ej_adv', 'Ejector advance', 'mm', ['abs', 10], 'T29'),
      f('ej_rv3', 'Retract speed 3', 'mm/s', ['rel', 10], 'E32'), f('ej_rv2', 'Retract speed 2', 'mm/s', ['rel', 10], 'H32'),
      f('ej_rv1', 'Retract speed 1', 'mm/s', ['rel', 10], 'K32'),
      f('ej_rs2', 'Retract pos. 2', 'mm', ['abs', 10], 'G33'), f('ej_rs1', 'Retract pos. 1', 'mm', ['abs', 10], 'J33'),
      f('ej_av1', 'Advance speed 1', 'mm/s', ['rel', 10], 'U32'), f('ej_av2', 'Advance speed 2', 'mm/s', ['rel', 10], 'AB32'),
      f('ej_av3', 'Advance speed 3', 'mm/s', ['rel', 10], 'AG32'),
      f('ej_as1', 'Advance pos. 1', 'mm', ['abs', 10], 'Y33'), f('ej_as2', 'Advance pos. 2', 'mm', ['abs', 10], 'AF33'),
      f('ej_as3', 'Advance pos. 3', 'mm', ['abs', 10], 'AH33'),
    ]},
    { id: 'inj', title: 'Injection', fields: [
      ...steps('ip', 'Inj. pressure', 'bar', ['rel', 10], ['AC40', 'Y40', 'T40', 'P40', 'J40', 'F40']),
      ...steps('iv', 'Inj. speed', 'mm/s', ['rel', 10], ['AC41', 'Y41', 'T41', 'P41', 'J41', 'F41']),
      ...steps('is', 'Inj. end pos.', 'mm', ['abs', 10], ['AC42', 'Y42', 'T42', 'P42', 'J42', 'F42']),
      f('hp_trans', 'Switch-over (H P trans) pos.', 'mm', ['abs', 10], 'C42'),
    ]},
    { id: 'hold', title: 'Holding pressure', fields: [
      ...steps('hp', 'Hold pressure', 'bar', ['rel', 10], ['AC45', 'Y45', 'T45', 'P45', 'J45', 'F45']),
      ...steps('ht', 'Hold time', 's', ['abs', 5], ['AC46', 'Y46', 'T46', 'P46', 'J46', 'F46']),
    ]},
    { id: 'timers', title: 'Times', fields: [
      f('inj_hold', 'Inj. hold', 's', ['abs', 10], 'F49'), f('rot_delay', 'Rotation delay', 's', ['abs', 5], 'J49'),
      f('cooling', 'Cooling time', 's', ['abs', 10], 'O49'), f('interval', 'Interval (pause) time', 's', ['abs', 5], 'S49'),
      f('inj_main_press', 'Inj. main (max) pressure', 'bar', null, 'X49'), f('hold_mode', 'Holding mode', '', null, 'AB49'),
      f('inj_delay', 'Injection delay time', 's', null, null, { note: 'No box on the form – printed in Remarks' }),
    ]},
    { id: 'dosage', title: 'Screw recovery (dosage)', fields: [
      ...steps('rot', 'Rotation (circ. speed)', 'm/min', ['rel', 10], ['AN43', 'AO43', 'AP43']),
      ...steps('bp', 'Back pressure', 'bar', ['rel', 10], ['AN44', 'AO44', 'AP44']),
      ...steps('dp', 'Dosage position', 'mm', ['abs', 10], ['AN45', 'AO45', 'AP45']),
      f('shot_size', 'Dosage stroke (shot size)', 'mm', ['abs', 10], 'AP46'),
      f('sb_mode', 'Suck back mode (0,1,2,3)', '', null, 'AN48'),
      f('sb_hp_v', 'Suck back after H.P – speed', 'mm/s', ['rel', 10], 'AN50'), f('sb_hp_s', 'Suck back after H.P – stroke', 'mm', ['abs', 10], 'AP50'),
      f('sb_rec_v', 'Suck back after rec. – speed', 'mm/s', ['rel', 10], 'AN51'), f('sb_rec_s', 'Suck back after rec. – stroke', 'mm', ['abs', 10], 'AP51'),
    ]},
    { id: 'heater', title: 'Mould heater controller setting', fields:
      [1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => f('mh' + n, 'Zone ' + n, '°C', ['abs', 10], ['F52', 'I52', 'L52', 'P52', 'S52', 'V52', 'Y52', 'AB52'][i])) },
  ],
  screens: [
    { id: 'cyl', title: 'Cylinder heating', page: 'Cylinder heating (temperature)',
      hint: 'Selogica temperature page with the green bars and the rows of zone values underneath.',
      read: 'Value rows under the bars: row 1 (thermometer icon) = ACTUAL, row 2 (set-point icon, editable, often one cell blue) = SET, row 3 "T+/-" = tolerance band. Columns left to right: zone 1 at the nozzle ... last cylinder zone, then the feed yoke (separate small bar on the right, 50-90 °C scale). Map SET values: 1st column -> bt_nh, 2nd -> bt_h7, 3rd -> bt_h6, 4th -> bt_h5, 5th -> bt_h4, 6th -> bt_h3, 7th -> bt_h2, 8th -> bt_h1, feed yoke -> bt_feed. If there are fewer than 8 cylinder zones, fill from bt_nh onward and leave the rest empty. Report the ACTUAL row as actuals.',
      fields: ['bt_nh', 'bt_h7', 'bt_h6', 'bt_h5', 'bt_h4', 'bt_h3', 'bt_h2', 'bt_h1', 'bt_feed'],
      actuals: ['bt_nh', 'bt_h7', 'bt_h6', 'bt_h5', 'bt_h4', 'bt_h3', 'bt_h2', 'bt_h1', 'bt_feed'] },
    { id: 'inj', title: 'Injection', page: 'Injection',
      hint: 'Selogica injection page: Dosage stroke, the v / p / s table with step numbers 4-3-2-1 and the switch-over values.',
      read: 'Table columns carry step numbers in arrow buttons (e.g. 4, 3, 2, 1 from left to right; step 1 is the first injection step). The grey first column is the actual value – ignore it. Row v = injection speed (mm/s) -> iv<step>. Row p = injection pressure (bar) -> ip<step>. Row s = the stroke where each step ENDS: the value under step n -> is<n>; the last step ends at the switch-over, so is<last step> = Switch-over stroke. "Switch-over stroke" white box -> hp_trans. "Dosage stroke" -> shot_size. "Delay time" -> inj_delay. Ignore greyed-out switch-over pressure/time if they show 0.0 or are grey actuals.',
      fields: ['iv1', 'iv2', 'iv3', 'iv4', 'iv5', 'iv6', 'ip1', 'ip2', 'ip3', 'ip4', 'ip5', 'ip6', 'is1', 'is2', 'is3', 'is4', 'is5', 'is6', 'hp_trans', 'shot_size', 'inj_delay'] },
    { id: 'hold', title: 'Holding pressure', page: 'Holding pressure',
      hint: 'Selogica holding pressure page with the p / t table per step.',
      read: 'Row p = holding pressure per step (bar) -> hp<step>. Row t = holding time per step (s) -> ht<step>. Step numbers are in the column headers.',
      fields: ['hp1', 'hp2', 'hp3', 'hp4', 'hp5', 'hp6', 'ht1', 'ht2', 'ht3', 'ht4', 'ht5', 'ht6'] },
    { id: 'dosage', title: 'Dosage', page: 'Dosage',
      hint: 'Selogica dosage page: circumferential speed, back pressure, dosage volume/stroke and decompression.',
      read: 'Circumferential speed per step -> rot<step>; back pressure per step -> bp<step>; stroke where each step ends -> dp<step>; dosage stroke / volume -> shot_size; decompression before dosage (after holding pressure): speed -> sb_hp_v, stroke -> sb_hp_s; decompression after dosage: speed -> sb_rec_v, stroke -> sb_rec_s; dosage delay -> rot_delay.',
      fields: ['rot1', 'rot2', 'rot3', 'bp1', 'bp2', 'bp3', 'dp1', 'dp2', 'dp3', 'shot_size', 'sb_hp_v', 'sb_hp_s', 'sb_rec_v', 'sb_rec_s', 'rot_delay'] },
    { id: 'mould', title: 'Mould open / close', page: 'Mould movements',
      hint: 'Selogica mould movement page(s): opening and closing speeds/positions, mould protection, clamp force.',
      read: 'Opening speeds per step -> mo_v<step>, opening positions -> mo_s<step>, opening stroke/open end -> open_end. Closing speeds -> mc_v<step>, closing positions -> mc_s<step>. Mould protection pressure/force -> mpp, mould protection time -> protect_time. Clamp force -> clamp_force. Mould height -> thickness.',
      fields: ['open_end', 'mo_v1', 'mo_v2', 'mo_v3', 'mo_v4', 'mo_s1', 'mo_s2', 'mo_s3', 'mc_v1', 'mc_v2', 'mc_v3', 'mc_s1', 'mc_s2', 'mc_s3', 'mpp', 'protect_time', 'clamp_force', 'thickness'] },
    { id: 'ejector', title: 'Ejector', page: 'Ejector',
      hint: 'Selogica ejector page: forward / back speeds and strokes.',
      read: 'Ejector forward speeds -> ej_av<step>, forward positions -> ej_as<step>, ejector advance stroke -> ej_adv, return speeds -> ej_rv<step>, return positions -> ej_rs<step>, intermediate stop -> ej_int.',
      fields: ['ej_int', 'ej_adv', 'ej_av1', 'ej_av2', 'ej_av3', 'ej_as1', 'ej_as2', 'ej_as3', 'ej_rv1', 'ej_rv2', 'ej_rv3', 'ej_rs1', 'ej_rs2'] },
    { id: 'cycle', title: 'Cycle / cooling times', page: 'Cycle / times',
      hint: 'Page showing cooling time, pause/interval time and the actual cycle time.',
      read: 'Cooling time -> cooling, pause/interval -> interval, actual cycle time -> cycle_time, injection time actual -> fill_time, dosage time actual -> plast_time, cushion actual -> cushion.',
      fields: ['cooling', 'interval', 'cycle_time', 'fill_time', 'plast_time', 'cushion'] },
    { id: 'heater', title: 'Mould heater / hot runner', page: 'Heater controller',
      hint: 'Mould heater or hot-runner controller showing zone 1–8 set values.',
      read: 'Set temperature of each zone 1..8 (ignore actual values).',
      fields: ['mh1', 'mh2', 'mh3', 'mh4', 'mh5', 'mh6', 'mh7', 'mh8'] },
  ],
  remarkExtras: ['bt_feed', 'inj_delay'],
  history: { sheet: 'BACK', firstRow: 7, lastRow: 25,
    cols: { A: 'rev', B: 'date', C: 'time', D: 'cavities', E: 'cycle_time',
      F: 'bt_nh', G: 'bt_h4', H: 'bt_h3', I: 'bt_h2', J: 'bt_h1', K: 'hp_trans',
      L: 'is5', M: 'is4', N: 'is3', O: 'is2', P: 'is1',
      Q: 'iv6', R: 'iv5', S: 'iv4', T: 'iv3', U: 'iv2', V: 'iv1',
      W: 'ip6', X: 'ip5', Y: 'ip4', Z: 'ip3', AA: 'ip2', AB: 'ip1',
      AC: 'hp6', AD: 'hp5', AE: 'hp4', AF: 'hp3', AG: 'hp2', AH: 'hp1',
      AI: 'ht6', AJ: 'ht5', AK: 'ht4', AL: 'ht3', AM: 'ht2', AN: 'ht1',
      AO: 'bp2', AP: 'bp1', AQ: 'rot2', AR: 'rot1', AS: 'shot_size', AT: 'cooling', AU: 'inj_hold',
      AV: 'changed_by', AW: 'ipqc', AX: 'verification', AY: 'approved_by', AZ: 'reason' } },
};

const PROFILES = { NISSEI: nissei, ARBURG: arburg };

// Build quick lookups
for (const p of Object.values(PROFILES)) {
  p.fieldMap = {};
  for (const g of HEADER_GROUPS) for (const fl of g.fields) p.fieldMap[fl.k] = { ...fl, section: g.id, header: true };
  for (const s of p.sections) for (const fl of s.fields) p.fieldMap[fl.k] = { ...fl, section: s.id };
  for (const sc of p.screens) for (const k of sc.fields) if (!p.fieldMap[k]) throw new Error(`${p.brand}: screen ${sc.id} has unknown field ${k}`);
}

function limits(field, value) {
  const v = parseFloat(value);
  if (!field || !field.tol || value === '' || value == null || isNaN(v)) return null;
  const [type, n] = field.tol;
  const d = type === 'rel' ? Math.abs(v) * n / 100 : n;
  const r = x => Math.round(x * 100) / 100;
  return { min: r(Math.max(0, v - d)), max: r(v + d), text: type === 'rel' ? `±${n}%` : `±${n}${field.unit === '°C' ? '°C' : ' ' + (field.unit || '')}`.trim() };
}

module.exports = { PROFILES, HEADER_GROUPS, limits };
