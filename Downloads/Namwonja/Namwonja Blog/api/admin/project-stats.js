// API: Admin project donation stats with daily breakdowns for charts
// GET /api/admin/project-stats
const { supabase, json, isAdmin, pickOrderColumn, hasColumn } = require('./_lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { json(res, 204, {}); return; }
  if (!supabase) { json(res, 500, { error: 'Supabase not configured.' }); return; }
  if (!isAdmin(req)) { json(res, 401, { error: 'Unauthorized' }); return; }

  if (req.method !== 'GET') { json(res, 405, { error: 'Method not allowed' }); return; }

  try {
    const projectsQuery = supabase.from('donation_projects').select('*');
    const orderCol = await pickOrderColumn('donation_projects');
    if (orderCol) projectsQuery.order(orderCol, { ascending: false });
    const { data: projects, error: pErr } = await projectsQuery;
    if (pErr) throw pErr;
    if (!projects || !projects.length) { json(res, 200, []); return; }

    const ids = projects.map(function (p) { return p.id; });
    const txQuery = supabase.from('mpesa_transactions').select('project_id, amount, status, created_at').in('project_id', ids);
    const orderColTx = await pickOrderColumn('mpesa_transactions');
    if (orderColTx) txQuery.order(orderColTx, { ascending: true });
    const { data: txs, error: tErr } = await txQuery;
    if (tErr) throw tErr;

    const now = new Date();
    const period = 30;
    const labels = [];
    for (var i = period - 1; i >= 0; i--) {
      var day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      labels.push(day.toISOString().slice(0, 10));
    }

    var raisedMap = {};
    var countMap = {};
    var dailyMap = {};
    (txs || []).forEach(function (tx) {
      var st = (tx.status || '').toLowerCase();
      var pid = tx.project_id;
      if (st === 'success') {
        raisedMap[pid] = (raisedMap[pid] || 0) + (Number(tx.amount) || 0);
        countMap[pid] = (countMap[pid] || 0) + 1;
      }
      var d = new Date(tx.created_at || now);
      if (!isNaN(d.getTime())) {
        var key = d.toISOString().slice(0, 10);
        if (!dailyMap[pid]) dailyMap[pid] = {};
        if (!dailyMap[pid][key]) dailyMap[pid][key] = { success: 0, pending: 0, failed: 0, total: 0 };
        dailyMap[pid][key][st] = (dailyMap[pid][key][st] || 0) + (Number(tx.amount) || 0);
        dailyMap[pid][key].total += (Number(tx.amount) || 0);
      }
    });

    var statusTotals = { success: 0, pending: 0, failed: 0 };
    (txs || []).forEach(function (tx) {
      var st = (tx.status || 'pending').toLowerCase();
      if (statusTotals[st] !== undefined) statusTotals[st] += Number(tx.amount) || 0;
    });

    var result = projects.map(function (p) {
      var daily = labels.map(function (day) {
        return dailyMap[p.id] && dailyMap[p.id][day] ? dailyMap[p.id][day].total : 0;
      });
      var raised = raisedMap[p.id] || 0;
      var target = Number(p.target_amount) || 0;
      var progress = target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        target_amount: target,
        raised_amount: raised,
        donation_count: countMap[p.id] || 0,
        progress_pct: progress,
        daily_labels: labels,
        daily_amounts: daily,
        status_breakdown: statusTotals
      };
    });

    json(res, 200, result);
  } catch (err) {
    json(res, 500, { error: err.message });
  }
};
