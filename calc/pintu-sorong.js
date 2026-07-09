// Pure hydraulics for sliding-gate (pintu sorong) discharge. No DOM access.
// Plain script (not an ES module) so it works over file://. Also exports for node.
// See DECISIONS.md 0006/0007. Formula source of truth: the app's info dialog.
(function (root) {
  'use strict';

  var G = 9.81;                    // gravitasi (m/s^2)
  var FREE_FLOW_GATE_LIMIT = 0.83; // a/h1 di atas nilai ini rumus debit tidak akurat (literatur)
  var MIN_TAILWATER_RATIO = 0.01;  // bila h2<=0, pakai 1% dari h1 agar free-flow bisa dihitung

  function parseLocaleFloat(v) {
    return parseFloat(String(v).trim().replace(',', '.')); // terima koma sebagai desimal
  }
  function cmToM(v) { return v / 100; }
  function invalid(ids, message) { return { ok: false, invalid: ids, message: message }; }

  // input: { h1, h2, a, b, cc } — h1,h2,a,b dalam cm; cc tanpa satuan. Nilai boleh berupa string.
  function computeDischarge(input) {
    var raw = {
      h1: parseLocaleFloat(input.h1),
      h2: parseLocaleFloat(input.h2),
      a:  parseLocaleFloat(input.a),
      b:  parseLocaleFloat(input.b),
      cc: parseLocaleFloat(input.cc)
    };

    var warning = null;

    if ([raw.h1, raw.h2, raw.a, raw.b, raw.cc].some(function (v) { return !Number.isFinite(v); }))
      return invalid(['h1','h2','a','b','cc'], 'Semua input harus berupa angka yang valid.');
    if (raw.h1 <= 0) return invalid(['h1'], 'Tinggi air di hulu harus lebih besar dari 0 cm.');
    if (raw.h2 < 0)  return invalid(['h2'], 'Tinggi air di hilir tidak boleh negatif.');
    if (raw.a <= 0)  return invalid(['a'], 'Bukaan pintu harus lebih besar dari 0 cm.');
    if (raw.b <= 0)  return invalid(['b'], 'Lebar pintu harus lebih besar dari 0 cm.');
    if (raw.cc <= 0 || raw.cc >= 1) return invalid(['cc'], 'Koefisien kontraksi (Cc) harus di antara 0 dan 1.');
    if (raw.h2 > raw.h1) return invalid(['h2','h1'], 'Tinggi air di hilir tidak boleh lebih besar dari tinggi air di hulu.');
    if (raw.a > FREE_FLOW_GATE_LIMIT * raw.h1)
      return invalid(['a','h1'], 'Bukaan pintu terlalu besar (a > 0.83 h1), rumus debit tidak berlaku.');

    var h1 = cmToM(raw.h1);
    var a  = cmToM(raw.a);
    var h2;
    if (raw.h2 <= 0) {
      h2 = MIN_TAILWATER_RATIO * h1; // h2 sangat kecil → dianggap aliran bebas
      warning = 'Tinggi air di hilir ≤ 0, perhitungan menggunakan aliran bebas (free flow).';
    } else {
      h2 = cmToM(raw.h2);
    }
    var B = cmToM(raw.b);
    var Cc = raw.cc;
    var lambda = h2 > 0 ? h1 / h2 : Infinity;
    var eta = (Cc * a) / h1;
    var xi = Math.pow((1 / eta) - 1, 2) + 2 * (lambda - 1);

    if (!Number.isFinite(eta) || eta <= 0) return invalid(['cc','a','h1'], 'Nilai η tidak valid. Periksa Cc, bukaan pintu, dan tinggi air di hulu.');
    if (!Number.isFinite(lambda)) return invalid(['h1','h2'], 'Nilai λ tidak valid.');
    if (!Number.isFinite(xi)) return invalid(['h1','h2','a','cc'], 'Nilai ξ tidak valid dari kombinasi input saat ini.');

    var Cd, flowType;
    var freeFlowLimit = (Cc * a / 2) * (Math.sqrt(1 + (16 / (eta * (1 + eta)))) - 1);
    if (!Number.isFinite(freeFlowLimit) || freeFlowLimit < 0) return invalid(['h1','h2','a','cc'], 'Batas aliran bebas tidak valid dari kombinasi input saat ini.');
    var freeFlow = h2 < freeFlowLimit;

    if (freeFlow) {
      Cd = Cc / Math.sqrt(1 + eta);
      flowType = 'Kondisi aliran bebas (free flow)';
    } else {
      var radicand2 = (xi * xi) - Math.pow((1 / (eta * eta)) - 1, 2) * (1 - (1 / (lambda * lambda)));
      if (!Number.isFinite(radicand2) || radicand2 < 0) return invalid(['h1','h2','a','cc'], 'Persamaan submerged flow menghasilkan akar negatif. Periksa input.');
      var bracket = xi - Math.sqrt(radicand2);
      if (!Number.isFinite(bracket) || bracket < 0) return invalid(['h1','h2','a','cc'], 'Bagian dalam akar pada Cd submerged flow tidak valid.');
      var numerator = Math.sqrt(bracket);
      var denominator = (1 / eta) - eta;
      if (!Number.isFinite(denominator) || denominator <= 0) return invalid(['h1','a','cc'], 'Penyebut pada persamaan Cd submerged flow tidak valid.');
      Cd = Cc * (numerator / denominator);
      flowType = 'Kondisi aliran tenggelam (submerged flow)';
      if (!Number.isFinite(Cd) || Cd <= 0) return invalid(['h1','h2','a','cc'], 'Nilai Cd tidak valid dari persamaan submerged flow.');
    }

    var Q = Cd * B * a * Math.sqrt(2 * G * h1);
    if (!Number.isFinite(Q) || Q < 0) return invalid(['h1','h2','a','b','cc'], 'Debit hasil perhitungan tidak valid.');

    return {
      ok: true,
      Q: Q,
      litersPerSecond: Q * 1000,
      Cd: Cd,
      flowType: flowType,
      lambda: lambda,
      eta: eta,
      xi: xi,
      freeFlowLimit: freeFlowLimit,
      warning: warning
    };
  }

  var api = { computeDischarge: computeDischarge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PintuSorong = api;
})(typeof self !== 'undefined' ? self : this);
