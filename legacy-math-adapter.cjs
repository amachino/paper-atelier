"use strict";
// Explicit snapshot compatibility debt. Keep it out of generic normalizers.
// This one cases-row-spacing conversion has been reviewed against the source PDF.
const records = require('./sources/legacy-math-repairs.json');
exports.lookup = function lookup(paper, math, originalTex) {
  const record = records.find(r => r.paper === paper && r.id === math.id);
  if (!record) return null;
  if (record.originalTex !== originalTex) throw new Error(`Legacy source mismatch: ${paper}:${math.id}`);
  return {...record, ruleVersion: 'legacy-cases-row-spacing/v1', legacy: true};
};
