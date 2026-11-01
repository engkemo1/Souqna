/**
 * Explicit, auditable category cleanup. No schema change, no name-similarity guessing: every action comes from a plan file
 * written by a human (plan.json). Dry-run by default; apply runs in ONE transaction, verifies invariants, and returns a
 * rollback document (old values of everything touched) that `rollback()` can restore.
 *
 * Operations: rename | reparent | create | move_products | deactivate | activate
 * Never deletes departments/products/orders. Products only move by an explicit from->to (optionally a product_ids list).
 */
import { CATEGORY_TABLES_SQL, addAlias } from './category-aliases.js';
const MAX_DEPTH = 6;
const enc = (list) => (list.length ? `,${[...new Set(list)].join(',')},` : '');
const dec = (s) => String(s || '').split(',').filter(Boolean);
const normName = (s) => String(s || '').normalize('NFKC').replace(/[ً-ٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();

export function runCleanup(db, plan, { apply = false, backupVerified = false } = {}) {
  const all = (sql, p = []) => db.prepare(sql).all(...p);
  const get = (sql, p = []) => db.prepare(sql).get(...p);
  const run = (sql, p = []) => db.prepare(sql).run(...p);
  const ops = Array.isArray(plan?.operations) ? plan.operations : [];
  const errors = []; const actions = []; const rollbackDoc = { run_key: plan?.run_key || null, departments: [], products: [], stores: [], created_departments: [], created_categories: [], categories: [] };
  if (apply && !backupVerified) return { ok: false, applied: false, errors: ['apply requires backupVerified (a verified production backup)'], actions };

  const snapshot = () => ({
    products: get('SELECT COUNT(*) n FROM products').n,
    orders: get("SELECT COUNT(*) n FROM sqlite_master WHERE name='orders'").n ? get('SELECT COUNT(*) n FROM orders').n : null,
    stores: get('SELECT COUNT(*) n FROM stores').n,
    departments: get('SELECT COUNT(*) n FROM departments').n,
    per_department: Object.fromEntries(all("SELECT COALESCE(department,'(none)') s, COUNT(*) n FROM products GROUP BY department").map((r) => [r.s, r.n])),
  });
  const before = snapshot();
  const inactiveQ = 'SELECT COUNT(*) n FROM products p JOIN departments d ON d.slug=p.department WHERE d.active=0';
  const inactiveBefore = get(inactiveQ).n;
  const dept = (slug) => get('SELECT * FROM departments WHERE slug=?', [slug]);
  const kids = (slug) => all('SELECT * FROM departments WHERE parent_slug=?', [slug]);
  const depthOf = (slug) => { let n = 0; for (let c = dept(slug); c && c.parent_slug && n < 20; c = dept(c.parent_slug)) n++; return n; };
  const subtreeHeight = (slug) => 1 + Math.max(0, ...kids(slug).map((k) => subtreeHeight(k.slug)));
  const isDescendant = (slug, ancestor) => { for (let c = dept(slug), n = 0; c && n < 20; c = dept(c.parent_slug), n++) if (c.slug === ancestor) return true; return false; };
  const dupSibling = (parent, name, exceptSlug) => all('SELECT slug, name_ar FROM departments WHERE parent_slug IS ? AND slug<>?', [parent || null, exceptSlug || '']).some((s) => normName(s.name_ar) === normName(name));

  const saveDept = (slug) => { if (!rollbackDoc.departments.some((d) => d.slug === slug)) rollbackDoc.departments.push({ ...dept(slug) }); };
  const mirror = (storeId, slug, depth = 0) => {
    const node = dept(slug); if (!node) return null;
    const catSlug = slug.replace(/_/g, '-');
    const ex = get('SELECT id FROM categories WHERE store_id=? AND slug=?', [storeId, catSlug]);
    if (ex) return ex.id;
    const parent = node.parent_slug ? dept(node.parent_slug) : null;
    const parentId = parent && parent.parent_slug && depth < 3 ? mirror(storeId, parent.slug, depth + 1) : null;
    const sort = (get('SELECT COALESCE(MAX(sort),-1)+1 AS n FROM categories WHERE store_id=?', [storeId]).n) || 0;
    const r = run('INSERT INTO categories (store_id, slug, name_ar, name_en, parent_id, system, sort) VALUES (?,?,?,?,?,1,?)', [storeId, catSlug, node.name_ar, node.name_en, parentId, sort]);
    rollbackDoc.created_categories.push(Number(r.lastInsertRowid));
    return Number(r.lastInsertRowid);
  };
  const syncMirrorParent = (slug) => {
    const node = dept(slug); const parent = node.parent_slug ? dept(node.parent_slug) : null;
    for (const c of all('SELECT id, store_id, parent_id, name_ar, name_en FROM categories WHERE slug=?', [slug.replace(/_/g, '-')])) {
      rollbackDoc.categories.push({ ...c });
      const parentId = parent && parent.parent_slug ? mirror(c.store_id, parent.slug) : null;
      run('UPDATE categories SET parent_id=?, name_ar=?, name_en=? WHERE id=?', [parentId, node.name_ar, node.name_en, c.id]);
    }
  };

  const body = () => {
    for (const [i, o] of ops.entries()) {
      const at = `op#${i + 1} ${o.op}`;
      const bad = (m) => { errors.push(`${at}: ${m}`); };
      try {
        if (o.op === 'rename') {
          const d = dept(o.slug); if (!d) { bad(`unknown department ${o.slug}`); continue; }
          const ar = o.name_ar ?? d.name_ar; const en = o.name_en ?? d.name_en;
          if (dupSibling(d.parent_slug, ar, d.slug)) { bad(`duplicate sibling name "${ar}"`); continue; }
          saveDept(d.slug); run('UPDATE departments SET name_ar=?, name_en=? WHERE slug=?', [ar, en, d.slug]); syncMirrorParent(d.slug);
          actions.push({ op: 'rename', slug: d.slug, from: d.name_ar, to: ar });
        } else if (o.op === 'reparent') {
          const d = dept(o.slug); if (!d) { bad(`unknown department ${o.slug}`); continue; }
          const p = o.parent_slug ? dept(o.parent_slug) : null;
          if (o.parent_slug && !p) { bad(`unknown parent ${o.parent_slug}`); continue; }
          if (p && (p.slug === d.slug || isDescendant(p.slug, d.slug))) { bad('cycle'); continue; }
          if ((p ? depthOf(p.slug) + 1 : 0) + subtreeHeight(d.slug) > MAX_DEPTH) { bad('too deep'); continue; }
          if (dupSibling(o.parent_slug || null, d.name_ar, d.slug)) { bad(`duplicate sibling name "${d.name_ar}" under ${o.parent_slug || 'root'}`); continue; }
          if (p && get('SELECT 1 FROM products WHERE department=?', [p.slug])) { bad(`parent ${p.slug} has its own products; move them first`); continue; }
          saveDept(d.slug); run('UPDATE departments SET parent_slug=? WHERE slug=?', [o.parent_slug || null, d.slug]); syncMirrorParent(d.slug);
          actions.push({ op: 'reparent', slug: d.slug, from: d.parent_slug, to: o.parent_slug || null });
        } else if (o.op === 'create') {
          if (dept(o.slug)) { actions.push({ op: 'create', slug: o.slug, skipped: 'exists' }); continue; }
          const p = o.parent_slug ? dept(o.parent_slug) : null;
          if (o.parent_slug && !p) { bad(`unknown parent ${o.parent_slug}`); continue; }
          if (dupSibling(o.parent_slug || null, o.name_ar, null)) { bad(`duplicate sibling name "${o.name_ar}"`); continue; }
          if ((p ? depthOf(p.slug) + 1 : 0) + 1 > MAX_DEPTH) { bad('too deep'); continue; }
          const sort = o.sort ?? (get('SELECT COALESCE(MAX(sort),0)+1 AS n FROM departments').n);
          run('INSERT INTO departments (slug, name_ar, name_en, parent_slug, sort, active) VALUES (?,?,?,?,?,1)', [o.slug, o.name_ar, o.name_en || o.name_ar, o.parent_slug || null, sort]);
          rollbackDoc.created_departments.push(o.slug);
          actions.push({ op: 'create', slug: o.slug, parent: o.parent_slug || null });
        } else if (o.op === 'move_products') {
          const from = dept(o.from); const to = dept(o.to);
          if (!from || !to) { bad('unknown from/to'); continue; }
          if (from.slug === to.slug) { bad('from equals to'); continue; }
          if (!to.active) { bad(`target ${to.slug} is inactive`); continue; }
          if (kids(to.slug).some((k) => k.active)) { bad(`target ${to.slug} has sub-sections; products must go to a leaf`); continue; }
          let rows;
          if (Array.isArray(o.product_ids) && o.product_ids.length) {
            rows = all(`SELECT id, store_id, department, category_id FROM products WHERE id IN (${o.product_ids.map(() => '?').join(',')})`, o.product_ids);
            if (rows.length !== o.product_ids.length || rows.some((r) => r.department !== from.slug)) { bad('product_ids must all exist and currently be in "from"'); continue; }
          } else rows = all('SELECT id, store_id, department, category_id FROM products WHERE department=?', [from.slug]);
          const touchedStores = new Set();
          for (const r of rows) {
            rollbackDoc.products.push({ id: r.id, department: r.department, category_id: r.category_id });
            const cat = mirror(r.store_id, to.slug);
            run('UPDATE products SET department=?, category_id=? WHERE id=?', [to.slug, cat, r.id]);
            touchedStores.add(r.store_id);
          }
          for (const sid of touchedStores) { // the store must sell the target section (otherwise the owner cannot edit those products)
            const s = get('SELECT id, departments FROM stores WHERE id=?', [sid]);
            if (!dec(s.departments).includes(to.slug)) { rollbackDoc.stores.push({ id: s.id, departments: s.departments }); run('UPDATE stores SET departments=? WHERE id=?', [enc([...dec(s.departments), to.slug]), s.id]); }
          }
          actions.push({ op: 'move_products', from: from.slug, to: to.slug, products: rows.length, reason: o.reason || null });
        } else if (o.op === 'deactivate' || o.op === 'activate') {
          const d = dept(o.slug); if (!d) { bad(`unknown department ${o.slug}`); continue; }
          if (o.op === 'deactivate') {
            if (get('SELECT 1 FROM products WHERE department=?', [d.slug])) { bad(`${d.slug} still has products`); continue; }
            if (kids(d.slug).some((k) => k.active)) { bad(`${d.slug} still has active sub-sections`); continue; }
          }
          saveDept(d.slug); run('UPDATE departments SET active=? WHERE slug=?', [o.op === 'activate' ? 1 : 0, d.slug]);
          actions.push({ op: o.op, slug: d.slug });
        } else if (o.op === 'alias') {
          const r = addAlias(db, { alias: o.alias, kind: o.kind || 'slug_ar', to_slug: o.to, reason: o.reason });
          if (!r.ok) { bad(r.error); continue; }
          actions.push({ op: 'alias', alias: r.alias, to: o.to, skipped: r.skipped || null });
        } else bad('unknown operation');
      } catch (e) { bad(e.message); }
    }
    if (apply && !errors.length) {
      db.exec(CATEGORY_TABLES_SQL);
      const runKey = String(plan.run_key || '').trim();
      if (!runKey) errors.push('apply requires plan.run_key (names this migration run in the history)');
      else for (const a of actions) {
        if (a.skipped) continue;
        const slugOf = a.op === 'alias' ? a.alias : (a.slug || a.from);
        const target = a.op === 'move_products' ? a.to : (a.op === 'alias' ? a.to : a.slug);
        const od = dept(a.op === 'move_products' ? a.from : (a.op === 'alias' ? a.to : a.slug)); const nd = dept(target);
        run(`INSERT OR IGNORE INTO category_migrations (run_key, old_department_id, old_name_ar, old_slug, new_department_id, new_name_ar, new_slug, type, reason, affected_products, status) VALUES (?,?,?,?,?,?,?,?,?,?, 'committed')`,
          [runKey, od?.id ?? null, a.op === 'rename' ? a.from : od?.name_ar ?? null, a.op === 'alias' ? slugOf : (a.op === 'move_products' ? a.from : a.slug), nd?.id ?? null, nd?.name_ar ?? null, a.op === 'move_products' ? a.to : (a.op === 'reparent' ? (a.to || '') : (a.op === 'alias' ? a.to : a.slug)), a.op, a.reason || (a.op === 'reparent' ? `parent ${a.from || 'root'} -> ${a.to || 'root'}` : null), a.products || 0]);
      }
    }
    const after = snapshot();
    if (after.products !== before.products) errors.push(`product count changed ${before.products} -> ${after.products}`);
    if (after.orders !== before.orders) errors.push('order count changed');
    if (after.stores !== before.stores) errors.push('store count changed');
    const orphans = get('SELECT COUNT(*) n FROM products p WHERE department IS NOT NULL AND department<>\'\' AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.slug=p.department)').n;
    if (orphans) errors.push(`${orphans} products reference a missing department`);
    const inactive = get(inactiveQ).n;
    if (inactive > inactiveBefore) errors.push('products would sit in an inactive department');
    return after;
  };

  let after;
  db.exec('BEGIN');
  try {
    after = body();
    if (errors.length || !apply) { db.exec('ROLLBACK'); }
    else db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} errors.push(e.message); }
  const applied = apply && !errors.length;
  if (applied) { // only now (committed) re-check the invariants and mark the history verified
    const orphans = get("SELECT COUNT(*) n FROM products p WHERE department IS NOT NULL AND department<>'' AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.slug=p.department)").n;
    const fin = snapshot();
    const good = !orphans && fin.products === before.products;
    run('UPDATE category_migrations SET status=? WHERE run_key=? AND status=\'committed\'', [good ? 'verified' : 'failed', String(plan.run_key).trim()]);
    if (!good) errors.push('post-commit verification failed; history marked failed');
  }
  return { ok: !errors.length, applied, dry_run: !apply, errors, actions, before, after, rollback: applied ? rollbackDoc : null };
}

export function rollback(db, doc) {
  db.exec('BEGIN');
  try {
    for (const p of doc.products || []) db.prepare('UPDATE products SET department=?, category_id=? WHERE id=?').run(p.department, p.category_id, p.id);
    for (const s of doc.stores || []) db.prepare('UPDATE stores SET departments=? WHERE id=?').run(s.departments, s.id);
    for (const c of doc.categories || []) db.prepare('UPDATE categories SET parent_id=?, name_ar=?, name_en=? WHERE id=?').run(c.parent_id, c.name_ar, c.name_en, c.id);
    for (const id of doc.created_categories || []) if (!db.prepare('SELECT 1 FROM products WHERE category_id=?').get(id)) db.prepare('DELETE FROM categories WHERE id=?').run(id);
    for (const d of doc.departments || []) db.prepare('UPDATE departments SET name_ar=?, name_en=?, parent_slug=?, active=?, sort=? WHERE slug=?').run(d.name_ar, d.name_en, d.parent_slug, d.active, d.sort, d.slug);
    for (const slug of doc.created_departments || []) if (!db.prepare('SELECT 1 FROM products WHERE department=?').get(slug)) db.prepare('DELETE FROM departments WHERE slug=?').run(slug);
    if (doc.run_key) db.prepare("UPDATE category_migrations SET status='rolled_back' WHERE run_key=? AND status IN ('committed','verified')").run(doc.run_key);
    db.exec('COMMIT'); return { ok: true };
  } catch (e) { db.exec('ROLLBACK'); return { ok: false, error: e.message }; }
}
