# How to read the machine-screen photos

Generated from tools/lib/profiles.js – do not edit by hand (run `node tools/build-meta.js`).

General rules
- Copy each number exactly as displayed, keeping the decimals shown (e.g. "240.0", "0.10"). Do not convert units. Numbers as strings.
- If a field is not on the photo or cannot be read, leave it out. Never guess.
- confidence "high" only when the digits are sharp and the mapping to the field is certain; otherwise "low" with a short reason in "why".
- A clearly displayed 0 / 0.0 is a real value – include it.
- First decide which screen the photo shows (page title / layout, see the screen list for the machine's brand). Use that screen id. If it matches none, use screen "unknown" and say what it shows in "seen".
- Add up to 15 other clearly readable settings that are not in the field list under "other" ({label, value, unit}).

## NISSEI (MSU-009-01)

### screen `barrel` – Barrel temperature (page: BARREL-OIL TEMPERATURE)
Zones are NOZ. (1), FRNT (2), MID (3), REAR (4); ch5–ch8 are unused unless non-zero. Use the SET row for the values. Also report the REAL row as actuals.

Fields (key: meaning [unit]):
- `bt_noz`: Nozzle [°C]
- `bt_front`: Front [°C]
- `bt_mid`: Middle [°C]
- `bt_rear`: Rear [°C]

Also report ACTUAL (measured) values under "actuals" for: bt_noz, bt_front, bt_mid, bt_rear

### screen `injmtg` – Injection / metering (INJ/MTG.2) (page: INJ/MTG.2)
INJECT TM, COOL TM, V5..V1 (%), TP2 (s), S5..S1, SM, SD (mm), P3, P2, P1 (%), VS (%). From the bottom monitor line: INJ. 1ST PS TM -> fill_time, MTG. TIME -> plast_time, INJ. END POS. -> cushion.

Fields (key: meaning [unit]):
- `inj_tm`: Inject TM [s]
- `cool_tm`: Cool TM [s]
- `v5`: V5 [%]
- `v4`: V4 [%]
- `v3`: V3 [%]
- `v2`: V2 [%]
- `v1`: V1 [%]
- `tp2`: TP2 [s]
- `s5`: S5 [mm]
- `s4`: S4 [mm]
- `s3`: S3 [mm]
- `s2`: S2 [mm]
- `s1`: S1 [mm]
- `sm`: SM (metering) [mm]
- `sd`: SD (decompress) [mm]
- `p3`: P3 [%]
- `p2`: P2 [%]
- `p1`: P1 [%]
- `vs`: VS (screw speed) [%]
- `fill_time`: Fill time [s]
- `plast_time`: Plast. time [s]
- `cushion`: Cushion pos. [mm]

### screen `mold` – Mold open / close (page: MOLD OPEN / CLOSE)
Mold close: H1 V, Slow V, LW P (low pressure / mould protect), H1 P (high pressure) and the switch position of each. Mold open: H1 V, Slow V, PRI V, PRI TM.

Fields (key: meaning [unit]):
- `mc_h1v`: Close H1 V [%]
- `mc_slv`: Close Slow V [%]
- `mc_lwp`: Close LW P [%]
- `mc_h1p`: Close H1 P [%]
- `mp_1`: Position (H1 V) [mm]
- `mp_2`: Position (Slow V) [mm]
- `mp_3`: Position (LW P) [mm]
- `mp_4`: Position (H1 P) [mm]
- `mo_h1v`: Open H1 V [%]
- `mo_slv`: Open Slow V [%]
- `mo_priv`: Open PRI V [%]
- `mo_pritm`: Open PRI TM [s]

### screen `metering` – Back pressure / pressure change (page: INJ/MTG.1 or MULTIPRESS)
Back pressure setting and the pressure change (V-P / PRS change) setting.

Fields (key: meaning [unit]):
- `back_press`: Back press
- `prs_chg`: PRS change

### screen `heater` – Mold heater / hot runner (page: Heater controller)
Set temperature of each zone 1..8 (ignore actual values).

Fields (key: meaning [unit]):
- `mh1`: Zone 1 [°C]
- `mh2`: Zone 2 [°C]
- `mh3`: Zone 3 [°C]
- `mh4`: Zone 4 [°C]
- `mh5`: Zone 5 [°C]
- `mh6`: Zone 6 [°C]
- `mh7`: Zone 7 [°C]
- `mh8`: Zone 8 [°C]

### screen `monitor` – Cycle monitor (optional) (page: Monitor)
Actual cycle time in seconds.

Fields (key: meaning [unit]):
- `cycle_time`: Cycle time [s]

## ARBURG (MSU-012-02)

### screen `cyl` – Cylinder heating (page: Cylinder heating (temperature))
Value rows under the bars: row 1 (thermometer icon) = ACTUAL, row 2 (set-point icon, editable, often one cell blue) = SET, row 3 "T+/-" = tolerance band. Columns left to right: zone 1 at the nozzle ... last cylinder zone, then the feed yoke (separate small bar on the right, 50-90 °C scale). Map SET values: 1st column -> bt_nh, 2nd -> bt_h7, 3rd -> bt_h6, 4th -> bt_h5, 5th -> bt_h4, 6th -> bt_h3, 7th -> bt_h2, 8th -> bt_h1, feed yoke -> bt_feed. If there are fewer than 8 cylinder zones, fill from bt_nh onward and leave the rest empty. Report the ACTUAL row as actuals.

Fields (key: meaning [unit]):
- `bt_nh`: NH (nozzle) [°C]
- `bt_h7`: H7 [°C]
- `bt_h6`: H6 [°C]
- `bt_h5`: H5 [°C]
- `bt_h4`: H4 [°C]
- `bt_h3`: H3 [°C]
- `bt_h2`: H2 [°C]
- `bt_h1`: H1 [°C]
- `bt_feed`: Feed yoke [°C]

Also report ACTUAL (measured) values under "actuals" for: bt_nh, bt_h7, bt_h6, bt_h5, bt_h4, bt_h3, bt_h2, bt_h1, bt_feed

### screen `inj` – Injection (page: Injection)
Table columns carry step numbers in arrow buttons (e.g. 4, 3, 2, 1 from left to right; step 1 is the first injection step). The grey first column is the actual value – ignore it. Row v = injection speed (mm/s) -> iv<step>. Row p = injection pressure (bar) -> ip<step>. Row s = the stroke where each step ENDS: the value under step n -> is<n>; the last step ends at the switch-over, so is<last step> = Switch-over stroke. "Switch-over stroke" white box -> hp_trans. "Dosage stroke" -> shot_size. "Delay time" -> inj_delay. Ignore greyed-out switch-over pressure/time if they show 0.0 or are grey actuals.

Fields (key: meaning [unit]):
- `iv1`: Inj. speed 1 [mm/s]
- `iv2`: Inj. speed 2 [mm/s]
- `iv3`: Inj. speed 3 [mm/s]
- `iv4`: Inj. speed 4 [mm/s]
- `iv5`: Inj. speed 5 [mm/s]
- `iv6`: Inj. speed 6 [mm/s]
- `ip1`: Inj. pressure 1 [bar]
- `ip2`: Inj. pressure 2 [bar]
- `ip3`: Inj. pressure 3 [bar]
- `ip4`: Inj. pressure 4 [bar]
- `ip5`: Inj. pressure 5 [bar]
- `ip6`: Inj. pressure 6 [bar]
- `is1`: Inj. end pos. 1 [mm]
- `is2`: Inj. end pos. 2 [mm]
- `is3`: Inj. end pos. 3 [mm]
- `is4`: Inj. end pos. 4 [mm]
- `is5`: Inj. end pos. 5 [mm]
- `is6`: Inj. end pos. 6 [mm]
- `hp_trans`: Switch-over (H P trans) pos. [mm]
- `shot_size`: Dosage stroke (shot size) [mm]
- `inj_delay`: Injection delay time [s]

### screen `hold` – Holding pressure (page: Holding pressure)
Row p = holding pressure per step (bar) -> hp<step>. Row t = holding time per step (s) -> ht<step>. Step numbers are in the column headers.

Fields (key: meaning [unit]):
- `hp1`: Hold pressure 1 [bar]
- `hp2`: Hold pressure 2 [bar]
- `hp3`: Hold pressure 3 [bar]
- `hp4`: Hold pressure 4 [bar]
- `hp5`: Hold pressure 5 [bar]
- `hp6`: Hold pressure 6 [bar]
- `ht1`: Hold time 1 [s]
- `ht2`: Hold time 2 [s]
- `ht3`: Hold time 3 [s]
- `ht4`: Hold time 4 [s]
- `ht5`: Hold time 5 [s]
- `ht6`: Hold time 6 [s]

### screen `dosage` – Dosage (page: Dosage)
Circumferential speed per step -> rot<step>; back pressure per step -> bp<step>; stroke where each step ends -> dp<step>; dosage stroke / volume -> shot_size; decompression before dosage (after holding pressure): speed -> sb_hp_v, stroke -> sb_hp_s; decompression after dosage: speed -> sb_rec_v, stroke -> sb_rec_s; dosage delay -> rot_delay.

Fields (key: meaning [unit]):
- `rot1`: Rotation (circ. speed) 1 [m/min]
- `rot2`: Rotation (circ. speed) 2 [m/min]
- `rot3`: Rotation (circ. speed) 3 [m/min]
- `bp1`: Back pressure 1 [bar]
- `bp2`: Back pressure 2 [bar]
- `bp3`: Back pressure 3 [bar]
- `dp1`: Dosage position 1 [mm]
- `dp2`: Dosage position 2 [mm]
- `dp3`: Dosage position 3 [mm]
- `shot_size`: Dosage stroke (shot size) [mm]
- `sb_hp_v`: Suck back after H.P – speed [mm/s]
- `sb_hp_s`: Suck back after H.P – stroke [mm]
- `sb_rec_v`: Suck back after rec. – speed [mm/s]
- `sb_rec_s`: Suck back after rec. – stroke [mm]
- `rot_delay`: Rotation delay [s]

### screen `mould` – Mould open / close (page: Mould movements)
Opening speeds per step -> mo_v<step>, opening positions -> mo_s<step>, opening stroke/open end -> open_end. Closing speeds -> mc_v<step>, closing positions -> mc_s<step>. Mould protection pressure/force -> mpp, mould protection time -> protect_time. Clamp force -> clamp_force. Mould height -> thickness.

Fields (key: meaning [unit]):
- `open_end`: Open end [mm]
- `mo_v1`: Opening speed 1 [mm/s]
- `mo_v2`: Opening speed 2 [mm/s]
- `mo_v3`: Opening speed 3 [mm/s]
- `mo_v4`: Opening speed 4 [mm/s]
- `mo_s1`: Opening pos. 1 [mm]
- `mo_s2`: Opening pos. 2 [mm]
- `mo_s3`: Opening pos. 3 [mm]
- `mc_v1`: Closing speed 1 [mm/s]
- `mc_v2`: Closing speed 2 [mm/s]
- `mc_v3`: Closing speed 3 [mm/s]
- `mc_s1`: Closing pos. 1 [mm]
- `mc_s2`: Closing pos. 2 [mm]
- `mc_s3`: Closing pos. 3 [mm]
- `mpp`: Mould protect pressure (MPP) [bar]
- `protect_time`: Mould protect time [s]
- `clamp_force`: Clamp force [kN]
- `thickness`: Mould thickness [mm]

### screen `ejector` – Ejector (page: Ejector)
Ejector forward speeds -> ej_av<step>, forward positions -> ej_as<step>, ejector advance stroke -> ej_adv, return speeds -> ej_rv<step>, return positions -> ej_rs<step>, intermediate stop -> ej_int.

Fields (key: meaning [unit]):
- `ej_int`: Intermediate stop pos. [mm]
- `ej_adv`: Ejector advance [mm]
- `ej_av1`: Advance speed 1 [mm/s]
- `ej_av2`: Advance speed 2 [mm/s]
- `ej_av3`: Advance speed 3 [mm/s]
- `ej_as1`: Advance pos. 1 [mm]
- `ej_as2`: Advance pos. 2 [mm]
- `ej_as3`: Advance pos. 3 [mm]
- `ej_rv1`: Retract speed 1 [mm/s]
- `ej_rv2`: Retract speed 2 [mm/s]
- `ej_rv3`: Retract speed 3 [mm/s]
- `ej_rs1`: Retract pos. 1 [mm]
- `ej_rs2`: Retract pos. 2 [mm]

### screen `cycle` – Cycle / cooling times (page: Cycle / times)
Cooling time -> cooling, pause/interval -> interval, actual cycle time -> cycle_time, injection time actual -> fill_time, dosage time actual -> plast_time, cushion actual -> cushion.

Fields (key: meaning [unit]):
- `cooling`: Cooling time [s]
- `interval`: Interval (pause) time [s]
- `cycle_time`: Cycle time [s]
- `fill_time`: Fill time [s]
- `plast_time`: Plast. time [s]
- `cushion`: Cushion pos. [mm]

### screen `heater` – Mould heater / hot runner (page: Heater controller)
Set temperature of each zone 1..8 (ignore actual values).

Fields (key: meaning [unit]):
- `mh1`: Zone 1 [°C]
- `mh2`: Zone 2 [°C]
- `mh3`: Zone 3 [°C]
- `mh4`: Zone 4 [°C]
- `mh5`: Zone 5 [°C]
- `mh6`: Zone 6 [°C]
- `mh7`: Zone 7 [°C]
- `mh8`: Zone 8 [°C]

