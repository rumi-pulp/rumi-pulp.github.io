/* rumi-pulp — the writing desk (owner only): editor, drafts and the publish screen */
(function () {
  "use strict";
  var RP = window.RP, RPO = window.RPO, RPB = window.RPB;
  if (!RP || !RPO || !RPB) {   // one of the script files did not load (or an old copy is cached)
    var gm = document.getElementById("gate-msg"), gt = document.getElementById("gate");
    if (gm) gm.textContent = "The editor couldn't load all its parts. Reload the page.";
    if (gt) gt.hidden = false;
    return;
  }
  var $ = RP.$, el = RP.el, store = RP.store;

  if (!RP.isOwner) {
    if (location.protocol === "file:") $("gate-msg").textContent = "Run node serve.js and open http://localhost:4321/stories.html";
    $("gate").hidden = false;
    return;
  }
  $("app").hidden = false;

  var body = $("wr-body"), plus = $("wr-plus"), ins = $("wr-ins"), selBar = $("sel-bar"), imgBar = $("img-bar"), notePop = $("note-pop"), marks = $("note-marks"), photos = $("wr-photos");
  var params = new URLSearchParams(location.search);
  // editSlug + postId: the published post this draft replaces. partial: that post was left half updated.
  // partialSlug/Id/Date: files of a failed first publish that could not be cleaned up.
  var DRAFT = { id: null, existed: false, editSlug: null, postId: "", editDate: null, partial: false, partialSlug: null, partialId: "", partialDate: null, fromSlug: null };
  var NOTES = {}, noteSeq = 0, openNoteId = null, noteNew = false, noteStep = null;
  var goal = 800, curFig = null, target = null, view = "write";
  var S = { displayTitle: "", displaySubtitle: "", dispTouched: false, tags: [], dropCap: false, visibility: "public", schedOn: false, schedDate: "", schedTime: "21:00", canonical: "", preview: null };
  var finished = false, publishing = false, loading = true, dirty = false, saveT = null, urlCache = {}, picker = null;
  var MAX_IMAGE = 8 * 1024 * 1024;
  var PH = "Tell your story…";
  var NOT_CHROME = "Publishing needs Chrome or Edge on your computer, because it saves into your rumi-pulp folder. Your story is safe in this browser as a draft.";

  function num(n) { return Number(n).toLocaleString("en-US"); }
  function wmsg(t) { $("wr-msg").textContent = t; }
  function timeText(d) { return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  function fit(t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
  function fitAll() { fit($("wr-title")); fit($("wr-sub")); }
  function qsa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function pressed(btn, on) { btn.setAttribute("aria-pressed", String(!!on)); }
  function parseTagString(s) {
    var out = [];
    String(s || "").split(",").forEach(function (t) { t = t.trim().toLowerCase().slice(0, 30); if (t && out.indexOf(t) < 0 && out.length < 5) out.push(t); });
    return out;
  }

  ["wr-title", "wr-sub"].forEach(function (id) {
    $(id).addEventListener("input", function () { fit(this); recordTyping(); touched(); });
    $(id).addEventListener("beforeinput", function (e) { onBeforeInput(e, id === "wr-title" ? "title" : "sub"); });
    $(id).addEventListener("keydown", function (e) {
      if (historyKey(e)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (id === "wr-title") $("wr-sub").focus();
        else { body.focus(); if (body.firstElementChild) placeCaret(body.firstElementChild); }
      }
    });
  });
  try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}

  /* ═════════ counts ═════════ */
  function clean() { return RPB.cleanBlocks(body, { merge: true }); }
  function count() {
    var frag = clean(), txt = RPB.plainText(frag, false), w = RPB.wordCount(frag);
    $("wr-count").textContent = w + (w === 1 ? " word" : " words");
    $("wr-chars").textContent = num(txt.length) + " characters";
    $("wr-read").textContent = RP.readTime(w) + " min read";
    $("wr-goal").textContent = "Goal: " + num(w) + " / " + num(goal) + " words" + (w >= goal ? " (reached)" : "");
    return w;
  }
  $("goal-btn").addEventListener("click", function () {
    $("goal-btn").hidden = true; $("goal-form").hidden = false; $("goal-in").value = goal; $("goal-in").focus(); $("goal-in").select();
  });
  function closeGoal(save) {
    if (save) {
      var raw = $("goal-in").value.trim(), n = Number(raw);
      if (!raw || !Number.isInteger(n) || n < 1 || n > 100000) { wmsg("Enter a whole number from 1 to 100,000"); $("goal-in").focus(); return; }
      goal = n; count(); wmsg("Goal set to " + num(goal) + " words."); touched();
    }
    $("goal-form").hidden = true; $("goal-btn").hidden = false; $("goal-btn").focus();
  }
  $("goal-set").addEventListener("click", function () { closeGoal(true); });
  $("goal-cancel").addEventListener("click", function () { closeGoal(false); });
  $("goal-in").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); closeGoal(true); } });

  /* ═════════ drafts ═════════ */
  function settingsOut() {
    return {
      displayTitle: S.dispTouched ? S.displayTitle : "", displaySubtitle: S.dispTouched ? S.displaySubtitle : "", dispTouched: S.dispTouched,
      tags: S.tags.slice(), dropCap: S.dropCap, visibility: S.visibility, schedOn: S.schedOn, schedDate: S.schedDate, schedTime: S.schedTime,
      canonical: S.canonical, previewImage: S.preview
    };
  }
  function applySettings(st) {
    st = RPO.isObj(st) ? st : {};
    S.displayTitle = String(st.displayTitle || "").slice(0, 100);
    S.displaySubtitle = String(st.displaySubtitle || "").slice(0, 140);
    S.dispTouched = st.dispTouched === true || !!(S.displayTitle || S.displaySubtitle);
    S.tags = (Array.isArray(st.tags) ? st.tags : parseTagString(st.tags)).filter(function (t) { return typeof t === "string" && t.trim(); }).map(function (t) { return t.trim().toLowerCase().slice(0, 30); }).slice(0, 5);
    S.dropCap = st.dropCap === true;
    S.visibility = st.visibility === "unlisted" ? "unlisted" : "public";
    S.schedOn = st.schedOn === true;
    S.schedDate = /^\d{4}-\d{2}-\d{2}$/.test(st.schedDate || "") ? st.schedDate : "";
    S.schedTime = /^\d{2}:\d{2}$/.test(st.schedTime || "") ? st.schedTime : "21:00";
    S.canonical = typeof st.canonical === "string" ? st.canonical : "";
    var pi = st.previewImage;
    S.preview = RPO.isObj(pi) && pi.name && RPB.NAME_RE.test(pi.name) ? { name: pi.name } : RPO.isObj(pi) && pi.remote && RP.imageOk(pi.remote) && /^https:/.test(pi.remote) ? { remote: pi.remote } : null;
  }
  function usedNotes() {
    var out = {};
    qsa(body, ".mk-note").forEach(function (s) { var id = s.getAttribute("data-note-id"); if (id in NOTES && NOTES[id]) out[id] = NOTES[id]; });
    return out;
  }
  function buildRecord() {
    var frag = clean();
    return {
      id: DRAFT.id, title: $("wr-title").value, subtitle: $("wr-sub").value, html: RPB.toHtml(frag), notes: usedNotes(), noteSeq: noteSeq, goal: goal,
      settings: settingsOut(), words: RPB.wordCount(frag), saved: new Date().toISOString(),
      editSlug: DRAFT.editSlug, postId: DRAFT.postId, editDate: DRAFT.editDate, partial: DRAFT.partial,
      partialSlug: DRAFT.partialSlug, partialId: DRAFT.partialId, partialDate: DRAFT.partialDate, fromSlug: DRAFT.fromSlug,
      _empty: !$("wr-title").value.trim() && !$("wr-sub").value.trim() && !frag.childNodes.length
    };
  }
  function persist(loud) {
    clearTimeout(saveT);
    if (finished || loading) return;
    var rec = buildRecord(), empty = rec._empty;
    delete rec._empty;
    if (empty && !DRAFT.existed) { dirty = false; if (loud) wmsg("Nothing to save yet. Write something first."); return; }
    RPO.drafts();
    if (RPO.draftsBroken) {   // the saved drafts could not be read: nothing is written over them
      dirty = true;
      $("wr-saved").textContent = "Not saved";
      wmsg(RPO.BROKEN_MSG);
      return;
    }
    var ok = RPO.putDraft(rec);
    if (ok && !DRAFT.existed) {
      DRAFT.existed = true;
      try { history.replaceState(null, "", "write.html?draft=" + encodeURIComponent(DRAFT.id) + location.hash); } catch (e) {}
    }
    dirty = !ok;
    $("wr-saved").textContent = ok ? "Saved draft · " + timeText(Date.now()) : "This draft couldn't be saved. Copy your text somewhere safe.";
    if (!ok) wmsg("This draft couldn't be saved: your browser's storage is full or blocked. Copy your text somewhere safe.");
    else if (loud) wmsg("Draft saved.");
  }
  function touched() {
    if (loading || finished) return;
    dirty = true;
    $("wr-saved").textContent = "Saving…";
    clearTimeout(saveT);
    renderMarks();
    saveT = setTimeout(function () { persist(false); }, 1200);
  }
  window.addEventListener("pagehide", function () { if (dirty && !publishing) persist(false); });
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === "s") { e.preventDefault(); if (!publishing) persist(true); }
  });

  /* ═════════ pictures kept with the draft ═════════ */
  function extFor(file) {
    var t = file.type, n = file.name.toLowerCase();
    if (t === "image/jpeg" || /\.jpe?g$/.test(n) && !t) return "jpg";
    if (t === "image/png") return "png";
    if (t === "image/webp") return "webp";
    if (t === "image/gif") return "gif";
    return null;
  }
  function pickFile(cb) {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";
    inp.addEventListener("change", function () { var f = inp.files && inp.files[0]; picker = null; if (f) cb(f); });
    picker = inp;   // keep a reference while the dialog is open
    inp.click();
  }
  // Checks the file, stores it with the draft and returns { name, url }, or null after telling the writer why not.
  async function addImage(file) {
    var ext = extFor(file);
    if (!ext) { wmsg("That file isn't a picture I can use. Choose a JPG, PNG, WebP or GIF."); return null; }
    if (file.size > MAX_IMAGE) { wmsg("That picture is " + (file.size / 1048576).toFixed(1) + " MB. The limit is 8 MB. Choose a smaller one."); return null; }
    var base = (RP.slugify(file.name.replace(/\.[^.]+$/, "")) || "picture").slice(0, 40).replace(/-+$/, "") || "picture";
    var name = base + "-" + Math.random().toString(36).slice(2, 6) + "." + ext;
    try { await RPO.imgPut(DRAFT.id, name, file); }
    catch (e) { wmsg("Couldn't keep that picture in this browser (" + (e && e.message ? e.message : "storage problem") + ")."); return null; }
    urlCache[name] = URL.createObjectURL(file);
    return { name: name, url: urlCache[name] };
  }
  // Pictures saved with the draft (or on the live site) get their address once the story is on screen.
  async function hydrate(f) {
    var name = f.getAttribute("data-name");
    if (!name) return;
    var img = f.querySelector("img");
    if (urlCache[name]) { img.src = urlCache[name]; return; }
    var blob = await RPO.imgGet(DRAFT.id, name);
    var path = f.getAttribute("data-path");
    if (!blob && path) {
      try {
        var r = await fetch("posts/" + path, { cache: "no-cache" });
        if (r.ok) { blob = await r.blob(); await RPO.imgPut(DRAFT.id, name, blob); }
      } catch (e) { /* handled below */ }
    }
    if (!blob) { f.classList.add("missing"); img.alt = "Picture missing"; f.setAttribute("aria-label", "Picture missing. Press Enter to replace or remove it."); return; }
    urlCache[name] = URL.createObjectURL(blob);
    img.src = urlCache[name];
  }
  function hydrateAll() { qsa(body, "figure.mk-fig").forEach(function (f) { hydrate(f); }); }
  function setBody(frag) {
    body.replaceChildren(frag);
    ensureTrailing();
    hydrateAll();
  }
  function figureOf(opts) {
    var f = RPB.makeFigure(opts);
    if (opts.name && urlCache[opts.name]) f.querySelector("img").src = urlCache[opts.name];
    return f;
  }

  /* ═════════ undo / redo ═════════
     The editor keeps its own history. The browser's cannot follow changes made straight to the page (typing shortcuts,
     inserted blocks, notes, pictures), so every such change records a snapshot first and Ctrl/Cmd+Z restores it.
     A snapshot is the story as the cleaner sees it (notes, pictures and cards kept as they are), the title, the subtitle,
     the private notes and where the cursor was. Plain typing is grouped into steps (a pause of a second, a word end
     after 20 characters, a different kind of edit, or moving the cursor starts a new step). */
  var MAX_UNDO = 200, undoStack = [], redoStack = [], batch = 0;
  var typing = { active: false, field: "", kind: "", t: 0, count: 0, node: null, off: 0 };

  function topBlock(n) {
    while (n && n !== body && n.parentNode !== body) n = n.parentNode;
    return n && n !== body ? n : null;
  }
  // Cursor positions are kept as "block number + characters into the block" (a line break counts as one), which stays
  // true even though a snapshot is rebuilt by the cleaner and its text nodes are not the same objects.
  function linLen(x) {
    if (x.nodeType === 3) return x.length;
    if (x.nodeName === "BR") return 1;
    var n = x.nodeName === "LI" ? 1 : 0;   // the end of a list item counts too, so the start of the next item is a different place
    for (var c = x.firstChild; c; c = c.nextSibling) n += linLen(c);
    return n;
  }
  function linPoint(node, off) {
    var kids = body.children, blk, n = 0, found = false;
    if (!kids.length) return null;
    if (node === body) { var at = Math.min(off, kids.length - 1); return { b: at, o: off > kids.length - 1 ? linLen(kids[at]) : 0 }; }
    blk = topBlock(node);
    if (!blk || blk.nodeType !== 1) return null;   // loose text directly in the story has no block number
    (function walk(x) {
      if (found) return;
      if (x === node) {
        if (x.nodeType === 3) n += off;
        else for (var i = 0, k = x.firstChild; k && i < off; i++, k = k.nextSibling) n += linLen(k);
        found = true; return;
      }
      if (x.nodeType === 3) { n += x.length; return; }
      if (x.nodeName === "BR") { n += 1; return; }
      for (var c = x.firstChild; c && !found; c = c.nextSibling) walk(c);
      if (!found && x.nodeName === "LI") n += 1;
    })(blk);
    return { b: Array.prototype.indexOf.call(kids, blk), o: n };
  }
  function pointAt(p) {
    var kids = body.children, hit = null, rem;
    if (!p || !(p.b >= 0) || !kids.length) return null;
    var blk = kids[Math.min(p.b, kids.length - 1)];
    rem = p.b > kids.length - 1 ? Infinity : p.o;
    (function walk(x) {
      if (hit) return;
      if (x.nodeType === 3) { if (rem <= x.length) hit = { node: x, off: rem }; else rem -= x.length; return; }
      if (x.nodeName === "BR") { if (rem <= 0 || (rem === 1 && !x.nextSibling && !x.previousSibling)) hit = { node: x.parentNode, off: Array.prototype.indexOf.call(x.parentNode.childNodes, x) }; else rem -= 1; return; }
      for (var c = x.firstChild; c && !hit; c = c.nextSibling) walk(c);
      if (!hit && x.nodeName === "LI") rem -= 1;
    })(blk);
    if (hit) return hit;
    var end = blk;
    while (end.lastChild && end.lastChild.nodeType === 1 && end.lastChild.nodeName !== "BR") end = end.lastChild;
    return { node: end, off: end.childNodes.length };
  }
  function caretNow() {
    var s = window.getSelection();
    if (!s.rangeCount) return null;
    var r = s.getRangeAt(0);
    if (!body.contains(r.startContainer) || !body.contains(r.endContainer)) return null;
    var a = editablePoint(r.startContainer, r.startOffset), z = editablePoint(r.endContainer, r.endOffset);
    return a && z ? { s: a, e: z } : null;
  }
  // linPoint, except that a position on a picture, divider or card (not its caption) is given as the line beside it.
  function editablePoint(node, off) {
    var blk = topBlock(node);
    if (blk && isBlockNode(blk) && !closestTag(node, /^FIGCAPTION$/)) {
      var nx = blk.nextElementSibling, pv = blk.previousElementSibling, kids = body.children;
      if (nx && nx.nodeName === "P") return { b: Array.prototype.indexOf.call(kids, nx), o: 0 };
      if (pv && pv.nodeName === "P") return { b: Array.prototype.indexOf.call(kids, pv), o: linLen(pv) };
      return null;
    }
    return linPoint(node, off);
  }
  // spaceAt: a text position where the browser has not yet put the space that a typing shortcut swallows; the snapshot includes it,
  // so that undoing "# " gives back "# " as written.
  function takeSnap(spaceAt) {
    var ae = document.activeElement, field = ae === $("wr-title") ? "title" : ae === $("wr-sub") ? "sub" : "body", caret = null, sn, plus1 = spaceAt && spaceAt.node.nodeType === 3;
    if (field === "body") caret = caretNow();
    if (plus1) spaceAt.node.insertData(spaceAt.off, " ");
    try { sn = { html: RPB.toHtml(RPB.cleanBlocks(body, { keep: true })) }; }
    finally { if (plus1) spaceAt.node.deleteData(spaceAt.off, 1); }
    if (plus1 && caret) { caret.s.o += 1; caret.e.o += 1; }
    sn.title = $("wr-title").value; sn.subtitle = $("wr-sub").value;
    sn.notes = JSON.stringify(NOTES); sn.caret = caret; sn.field = field;
    sn.ts = field === "body" ? 0 : ae.selectionStart; sn.te = field === "body" ? 0 : ae.selectionEnd;
    sn.ck = JSON.stringify(caret);
    return sn;
  }
  function sameSnap(a, b) {
    return a.html === b.html && a.title === b.title && a.subtitle === b.subtitle && a.notes === b.notes && a.field === b.field && a.ck === b.ck && a.ts === b.ts && a.te === b.te;
  }
  function updateUndo() {
    [["b-undo", undoStack], ["b-redo", redoStack]].forEach(function (x) {
      var b = $(x[0]), off = !x[1].length;
      b.disabled = off; b.setAttribute("aria-disabled", String(off));
    });
  }
  function resetUndo() { undoStack.length = 0; redoStack.length = 0; typing.active = false; updateUndo(); }
  // Records the story as it is now, before a change. Returns the snapshot, or null when nothing was recorded.
  function pushUndo(spaceAt) {
    if (loading || batch) return null;
    typing.active = false;
    redoStack.length = 0;
    var sn = takeSnap(spaceAt), top = undoStack[undoStack.length - 1];
    if (top && sameSnap(top, sn)) sn = null;
    else { undoStack.push(sn); if (undoStack.length > MAX_UNDO) undoStack.shift(); }
    updateUndo();
    return sn;
  }
  // Records a snapshot, then runs a change that goes through the browser's editing commands (whose own events must not record more).
  function edit(fn, spaceAt) {
    pushUndo(spaceAt);
    batch++;
    try { return fn(); } finally { batch--; }
  }
  function restoreSnap(sn) {
    var hadFocus = body.contains(document.activeElement), ta;
    batch++;
    try {
      hideBar(); hideImgBar(false); closeInserter(false); target = null;
      openNoteId = null; notePop.hidden = true;
      $("wr-title").value = sn.title; $("wr-sub").value = sn.subtitle; fitAll();
      NOTES = JSON.parse(sn.notes);
      Object.keys(NOTES).forEach(function (id) { var n = Number(id.slice(1)); if (n > noteSeq) noteSeq = n; });
      setBody(RPB.fromHtml(sn.html, { keep: true }));
      try {   // putting the cursor back must never stop the restore itself
        if (sn.field !== "body") {
          ta = $(sn.field === "title" ? "wr-title" : "wr-sub");
          ta.focus({ preventScroll: true });
          ta.setSelectionRange(sn.ts, sn.te);
        } else {
          var a = sn.caret && pointAt(sn.caret.s), z = sn.caret && pointAt(sn.caret.e), ok = a && z && editableAt(a) && editableAt(z);
          if (ok || hadFocus) {
            body.focus({ preventScroll: true });
            var r = document.createRange(), s = window.getSelection();
            if (ok) { r.setStart(a.node, a.off); r.setEnd(z.node, z.off); }
            else { r.selectNodeContents(body.lastElementChild); r.collapse(true); }
            s.removeAllRanges(); s.addRange(r);
            var blk = topBlock(r.startContainer), rc = blk && blk.getBoundingClientRect();
            if (rc && (rc.bottom < 0 || rc.top > window.innerHeight)) blk.scrollIntoView({ block: "center" });
          }
        }
      } catch (e) { /* the cursor stays wherever the browser put it */ }
      afterEdit();
    } finally { batch--; }
    typing.active = false;
  }
  function editableAt(pt) { var n = pt.node.nodeType === 3 ? pt.node.parentNode : pt.node; return !!n && n.isContentEditable; }
  // What can be seen: the same title, subtitle, story and notes (the trailing empty line and the cursor do not count).
  function visSame(a, b) { return a.html === b.html && a.title === b.title && a.subtitle === b.subtitle && a.notes === b.notes; }
  // Goes one visible step from one stack to the other. Steps that would change nothing on screen (such as Enter at the end
  // of the story) are passed over and moved to the other stack too, so undo and redo stay in step.
  function step(from, to) {
    if (!from.length) return;
    var cur = takeSnap(), skipped = [], sn = null;
    while (from.length) { sn = from.pop(); if (!visSame(sn, cur)) break; skipped.push(sn); sn = null; }
    if (sn) {
      to.push(cur);
      skipped.forEach(function (x) { to.push(x); });
      if (to.length > MAX_UNDO) to.splice(0, to.length - MAX_UNDO);
    }
    try { if (sn) restoreSnap(sn); }
    finally {
      var now = sn || cur;   // a side that holds only invisible steps counts as empty
      [undoStack, redoStack].forEach(function (st) { if (!st.some(function (x) { return !visSame(x, now); })) st.length = 0; });
      updateUndo();
    }
  }
  function undo() { step(undoStack, redoStack); }
  function redo() { step(redoStack, undoStack); }
  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y belong to the editor, never to the browser.
  function historyKey(e) {
    var k = (e.key || "").toLowerCase();
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;
    if (k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return true; }
    if (k === "y" && e.ctrlKey && !e.shiftKey) { e.preventDefault(); redo(); return true; }
    return false;
  }
  function fieldEl(f) { return f === "title" ? $("wr-title") : f === "sub" ? $("wr-sub") : null; }
  // Called before the browser applies an edit to the story, title, subtitle or picture description.
  function onBeforeInput(e, field) {
    var t = e.inputType || "";
    if (t === "historyUndo" || t === "historyRedo") { e.preventDefault(); if (t === "historyUndo") undo(); else redo(); return; }
    if (loading || batch) return;
    var kind = /^insert(Text|CompositionText)$/.test(t) ? "ins" : /^delete(Content|Word|SoftLine|HardLine)(Backward|Forward)$/.test(t) ? "del" : "", own = fieldEl(field);
    var plain = !!kind;
    if (plain && own && own.selectionStart !== own.selectionEnd) plain = false;       // replacing or deleting a selection
    if (plain && !own && !window.getSelection().isCollapsed) plain = false;
    if (plain && !own && kind === "del" && e.getTargetRanges) {                      // deleting across two blocks joins them
      var tr = e.getTargetRanges()[0];
      if (tr && topBlock(tr.startContainer) !== topBlock(tr.endContainer)) plain = false;
    }
    if (!plain) { pushUndo(); return; }
    var now = Date.now(), data = e.data || "", s = window.getSelection();
    var same = typing.active && typing.field === field && typing.kind === kind && now - typing.t <= 1000 &&
      (own ? own.selectionStart === typing.off : s.anchorNode === typing.node && s.anchorOffset === typing.off);
    if (same && typing.count >= 20 && /^\s+$/.test(data)) same = false;            // a word ends after 20 or more characters
    if (!same) { pushUndo(); typing.count = 0; }
    typing.active = true; typing.field = field; typing.kind = kind; typing.t = now; typing.count += data.length || 1;
  }
  // After an edit: where the cursor is now, so the next keystroke can tell whether it moved away.
  function recordTyping() {
    if (!typing.active) return;
    var own = fieldEl(typing.field), s = window.getSelection();
    if (own) typing.off = own.selectionStart; else { typing.node = s.anchorNode; typing.off = s.anchorOffset; }
  }
  ["b-undo", "b-redo"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });
  $("b-undo").addEventListener("click", undo);
  $("b-redo").addEventListener("click", redo);
  body.addEventListener("beforeinput", function (e) { onBeforeInput(e, "body"); });

  // Chrome can put a new list inside the paragraph it came from; lift it out so lists sit directly in the story.
  function fixLists() {
    var lists = body.querySelectorAll(":scope > p > ul, :scope > p > ol");
    if (!lists.length) return;
    var sel = window.getSelection(), li = sel.rangeCount && body.contains(sel.anchorNode) ? closestTag(sel.anchorNode, /^LI$/) : null;
    Array.prototype.forEach.call(lists, function (l) {
      var p = l.parentNode;
      body.insertBefore(l, p);
      if (!p.textContent.trim()) p.remove();
    });
    if (li) { var r = document.createRange(); r.selectNodeContents(li); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  }
  function afterEdit() {
    fixLists();
    ensureTrailing();
    count(); touched(); updatePlus(); renderMarks(); recordTyping();
  }
  body.addEventListener("input", afterEdit);
  body.addEventListener("paste", function (e) {
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData("text/plain");
    var s = window.getSelection();
    if (s.rangeCount && closestTag(s.anchorNode, /^FIGCAPTION$/)) t = t.replace(/\s*\r?\n\s*/g, " ");
    if (t) edit(function () { document.execCommand("insertText", false, t); });
  });

  function curBlock() {
    var s = window.getSelection();
    if (!s.rangeCount) return null;
    var n = s.anchorNode;
    while (n && n.parentNode !== body) n = n.parentNode;
    return n && n.parentNode === body ? n : null;
  }
  function closestTag(n, re) {
    while (n && n !== body) { if (n.nodeType === 1 && re.test(n.nodeName)) return n; n = n.parentNode; }
    return null;
  }
  function isEmptyPara(b) { return !!b && b.nodeName === "P" && !b.textContent.trim(); }
  function placeCaret(node) {
    var r = document.createRange(), s = window.getSelection();
    r.selectNodeContents(node); r.collapse(true); s.removeAllRanges(); s.addRange(r);
  }

  /* ═════════ removing blocks that are not text ═════════ */
  // A picture, divider or card: not editable text, but focusable so it can be selected.
  function isBlockNode(n) { return !!n && n.nodeType === 1 && n.parentNode === body && n.nodeName !== "P" && n.getAttribute("contenteditable") === "false"; }
  function placeCaretEnd(node) {
    var r = document.createRange(), s = window.getSelection();
    r.selectNodeContents(node); r.collapse(false); s.removeAllRanges(); s.addRange(r);
  }
  // Removes a block and leaves the cursor in a text line: keep (if given), else the line after, else the line before, else a new one.
  function dropBlock(blk, message, keep) {
    pushUndo();
    if (curFig === blk) hideImgBar(false);
    var next = blk.nextElementSibling, prev = blk.previousElementSibling, p = keep, atEnd = false;
    if (!p) {
      if (next && next.nodeName === "P") p = next;
      else if (prev && prev.nodeName === "P") { p = prev; atEnd = true; }
      else { p = RPB.para(""); body.insertBefore(p, blk); }
    }
    blk.remove();
    body.focus({ preventScroll: true });
    if (atEnd) placeCaretEnd(p); else placeCaret(p);
    wmsg(message);
    afterEdit();
  }
  // Arrow keys on a selected block: the cursor moves to the line after (or before) it.
  // Only when there is no text line there is one made, and it goes away again if the cursor leaves it empty.
  function caretBeside(blk, after) {
    var p = after ? blk.nextElementSibling : blk.previousElementSibling;
    if (!p || p.nodeName !== "P") {
      p = RPB.para("");
      p.setAttribute("data-temp", "1");
      body.insertBefore(p, after ? blk.nextSibling : blk);
    }
    body.focus({ preventScroll: true });
    if (after) placeCaret(p); else placeCaretEnd(p);
  }
  function dropTempLines() {
    qsa(body, "p[data-temp]").forEach(function (p) {
      if (p.textContent.trim()) p.removeAttribute("data-temp");
      else if (p !== curBlock() && p !== body.lastElementChild) { p.remove(); renderMarks(); }
    });
  }
  function preText(pre) {
    var t = "";
    (function walk(x) {
      Array.prototype.forEach.call(x.childNodes, function (c) {
        if (c.nodeType === 3) t += c.nodeValue; else if (c.nodeName === "BR") t += "\n"; else if (c.nodeType === 1) walk(c);
      });
    })(pre);
    return t.replace(/\u00a0/g, " ").replace(/\n+$/, "");
  }
  // Backspace at the very start of a code block turns it back into text, one paragraph per line (an empty block just goes).
  function unwrapCode(pre) {
    pushUndo();
    var text = preText(pre), prev = pre.previousElementSibling, next = pre.nextElementSibling, first;
    if (!text) {
      if (isEmptyPara(prev)) { pre.remove(); body.focus({ preventScroll: true }); placeCaretEnd(prev); }
      else if (isEmptyPara(next)) { pre.remove(); body.focus({ preventScroll: true }); placeCaret(next); }
      else { first = RPB.para(""); body.replaceChild(first, pre); body.focus({ preventScroll: true }); placeCaret(first); }
      wmsg("Code block removed.");
    } else {
      text.split("\n").forEach(function (line, i) {
        var p = RPB.para(line); body.insertBefore(p, pre); if (!i) first = p;
      });
      pre.remove();
      body.focus({ preventScroll: true }); placeCaret(first);
      wmsg("Code block turned into text.");
    }
    afterEdit();
  }
  // Delete at the end of a code block pulls the next line up into it (a block that is not text gets selected instead).
  function mergeIntoCode(pre) {
    var next = pre.nextElementSibling;
    if (!next || isBlockNode(next) || !/^(P|H2|H3|BLOCKQUOTE)$/.test(next.nodeName)) return;
    if (next.querySelector(".mk-note, a, img, figure, .mk-embed, .mk-stars")) { wmsg("That line has a note or a link, so it can't be pulled into a code block."); return; }
    var txt = preText(next);
    if (!txt && next === body.lastElementChild) return;   // the empty line that always waits at the end
    pushUndo();
    var at = pre.childNodes.length, endsInBreak = !!pre.lastChild && pre.lastChild.nodeName === "BR";
    txt.split("\n").forEach(function (line, i) {
      if (!txt) return;
      if (i || (at && !endsInBreak)) pre.appendChild(document.createElement("br"));
      if (line) pre.appendChild(document.createTextNode(line));
    });
    next.remove();
    var r = document.createRange(), s = window.getSelection();
    r.setStart(pre, at); r.collapse(true); s.removeAllRanges(); s.addRange(r);
    afterEdit();
  }
  // Backspace / Delete where the browser would do nothing useful. Returns true when handled.
  function deleteKey(e) {
    if (e.isComposing || e.keyCode === 229) return false;   // an input method is at work
    var sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed || !body.contains(sel.anchorNode)) return false;
    var cb = curBlock(), back = e.key === "Backspace", pt = cb && linPoint(sel.anchorNode, sel.anchorOffset);
    if (!cb || !pt) return false;
    if (cb.nodeName === "PRE") {
      if (back && pt.o === 0) { e.preventDefault(); unwrapCode(cb); return true; }
      if (!back && pt.o >= linLen(cb)) { e.preventDefault(); mergeIntoCode(cb); return true; }
      return false;
    }
    if (cb.nodeName !== "P") return false;
    var empty = isEmptyPara(cb), nb = back ? cb.previousElementSibling : cb.nextElementSibling;
    if (!isBlockNode(nb) || !(back ? pt.o === 0 : empty || pt.o >= linLen(cb))) return false;
    e.preventDefault();   // text is never pulled into, or deleted along with, a block: only an empty line removes it
    if (empty) dropBlock(nb, nb.nodeName === "FIGURE" ? "Image removed." : "Block removed.", cb);
    return true;
  }

  /* ═════════ the "+" inserter ═════════ */
  function insButtons() { return Array.prototype.slice.call(ins.querySelectorAll("button")); }
  function insOpen() { return ins.classList.contains("open"); }
  function setInsTab(i) { insButtons().forEach(function (b, k) { b.tabIndex = k === i ? 0 : -1; }); }
  function inserterFocused() { var a = document.activeElement; return a === plus || ins.contains(a) || photos.contains(a); }
  function openInserter(focusFirst) {
    ins.classList.add("open"); plus.setAttribute("aria-expanded", "true"); plus.classList.remove("idle"); setInsTab(0);
    if (focusFirst) insButtons()[0].focus({ preventScroll: true });
  }
  function closeInserter(returnFocus) {
    ins.classList.remove("open"); plus.setAttribute("aria-expanded", "false"); photos.hidden = true; setInsTab(-1);
    if (searchCtl) { searchCtl.abort(); searchCtl = null; }
    if (returnFocus) { body.focus({ preventScroll: true }); if (target && target.parentNode) placeCaret(target); }
  }
  function hideInserter() {
    plus.hidden = true; closeInserter(false); target = null;
    Array.prototype.forEach.call(body.querySelectorAll("p.has-plus"), function (p) { p.classList.remove("has-plus"); });
  }
  // The story always ends with one empty line (the "+" waits there). Only one blank line is kept at the very end.
  function ensureTrailing() {
    var last = body.lastElementChild;
    if (isEmptyPara(last)) {
      var prev = last.previousElementSibling;
      if (isEmptyPara(prev)) (curBlock() === prev ? last : prev).remove();
      return;
    }
    var s = window.getSelection();
    // while you are typing in the last line, the next blank line waits until you move away
    if (last && last.nodeName === "P" && s.rangeCount && body.contains(s.anchorNode) && curBlock() === last) return;
    body.appendChild(RPB.para(""));
  }
  function updatePlus() {
    if (view !== "write" || loading) return;   // not while the story is still being opened
    ensureTrailing();
    var s = window.getSelection(), b = s.rangeCount && body.contains(s.anchorNode) ? curBlock() : null;
    var last = body.lastElementChild, trail = isEmptyPara(last) ? last : null, t, idle = false;
    if (isEmptyPara(b)) t = b;
    else if (inserterFocused() && target && target.parentNode === body && isEmptyPara(target)) t = target;
    else { t = trail; idle = true; }
    if (!t) { hideInserter(); return; }
    if (target !== t) closeInserter(false);   // a different line starts with the menu closed
    target = t;
    Array.prototype.forEach.call(body.querySelectorAll("p.has-plus"), function (p) { if (p !== t) p.classList.remove("has-plus"); });
    Array.prototype.forEach.call(body.querySelectorAll("p[data-placeholder]"), function (p) { if (p !== t && p !== trail) p.removeAttribute("data-placeholder"); });
    t.classList.add("has-plus");
    t.setAttribute("data-placeholder", PH);
    if (trail && trail !== t) trail.setAttribute("data-placeholder", PH);
    plus.hidden = false;
    plus.classList.toggle("idle", idle && !insOpen());
    var top = t.offsetTop + Math.max(0, (t.offsetHeight - 32) / 2);
    plus.style.top = top + "px"; ins.style.top = top + "px"; photos.style.top = (top + 42) + "px";
  }
  plus.addEventListener("mousedown", function (e) { e.preventDefault(); });   // keep the text cursor in the line
  ins.addEventListener("mousedown", function (e) { e.preventDefault(); });
  plus.addEventListener("click", function (e) {
    if (insOpen() || !photos.hidden) { closeInserter(true); return; }
    if (!target || !target.parentNode) { updatePlus(); if (!target) return; }
    var s = window.getSelection();
    if (!(s.rangeCount && body.contains(s.anchorNode) && curBlock() === target)) { body.focus({ preventScroll: true }); placeCaret(target); }
    openInserter(e.detail === 0);   // keyboard activation moves focus into the row; a mouse click leaves it in the text
  });
  ins.addEventListener("keydown", function (e) {
    var bs = insButtons(), i = bs.indexOf(document.activeElement), n = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % bs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + bs.length) % bs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = bs.length - 1;
    if (n === null) return;
    e.preventDefault(); setInsTab(n); bs[n].focus({ preventScroll: true });
  });

  // Puts a new block just above the empty line the "+" belongs to.
  function commitBlock(node, kind, message, tgt) {
    tgt = tgt && tgt.parentNode === body ? tgt : target;
    if (!tgt || !tgt.parentNode) return;
    pushUndo();
    body.insertBefore(node, tgt);
    closeInserter(false);
    body.focus({ preventScroll: true });
    if (kind === "code") placeCaret(node); else placeCaret(tgt);
    wmsg(message);
    afterEdit();
  }

  /* ── free photos (Unsplash) ── */
  var UTM = "utm_source=rumi-pulp&utm_medium=referral";
  function withUtm(u) { return u + (u.indexOf("?") >= 0 ? "&" : "?") + UTM; }
  function unsplashKey() { return (store.get("rp:unsplash") || "").trim(); }
  function buildPhotos(note) {
    if (searchCtl) { searchCtl.abort(); searchCtl = null; }
    photos.textContent = "";
    var key = unsplashKey();
    if (!key) {
      photos.appendChild(el("p", null, "Free photos come from Unsplash. To search them here you need a free access key. It takes a minute."));
      var p2 = el("p", null, "1. Open ");
      var a = el("a", null, "unsplash.com/developers"); a.href = "https://unsplash.com/developers"; a.target = "_blank"; a.rel = "noopener";
      p2.appendChild(a); p2.appendChild(document.createTextNode(", sign in and create an app."));
      p2.appendChild(document.createElement("br"));
      p2.appendChild(document.createTextNode("2. Copy its Access Key and paste it below. It stays on this computer only."));
      photos.appendChild(p2);
      var f = el("form", "ph-row");
      var lb = el("label", "sr-only", "Unsplash access key"); lb.setAttribute("for", "ph-key");
      var inp = el("input", "field"); inp.id = "ph-key"; inp.type = "password"; inp.autocomplete = "off"; inp.spellcheck = false; inp.placeholder = "Paste your Access Key";
      var show = el("button", "btn small", "Show"); show.type = "button"; show.setAttribute("aria-pressed", "false");
      show.addEventListener("click", function () {
        var on = inp.type === "password";
        inp.type = on ? "text" : "password"; show.textContent = on ? "Hide" : "Show"; show.setAttribute("aria-pressed", String(on));
      });
      var sv = el("button", "btn small primary", "Save key"); sv.type = "submit";
      f.appendChild(lb); f.appendChild(inp); f.appendChild(show); f.appendChild(sv);
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var k = inp.value.trim();
        if (!/^[A-Za-z0-9_-]{16,120}$/.test(k)) { err.textContent = "That doesn't look like an access key. It is one long line of letters and numbers."; inp.focus(); return; }
        store.set("rp:unsplash", k);
        buildPhotos("Key saved. Now search for a photo.");
        var q = $("ph-q"); if (q) q.focus();
      });
      photos.appendChild(f);
      var err = el("p", "ph-note"); err.setAttribute("role", "status"); photos.appendChild(err);
      inp.focus({ preventScroll: true });
      return;
    }
    var form = el("form", "ph-row");
    var l2 = el("label", "sr-only", "Search free photos"); l2.setAttribute("for", "ph-q");
    var q = el("input", "field"); q.id = "ph-q"; q.autocomplete = "off"; q.placeholder = "Search free photos"; q.type = "search";
    var go = el("button", "btn small", "Search"); go.type = "submit";
    form.appendChild(l2); form.appendChild(q); form.appendChild(go);
    var msg = el("p", "ph-note", note || "Photos from Unsplash. Type a word and press Enter."); msg.setAttribute("role", "status");
    var grid = el("div", "ph-grid");
    var ch = el("button", "text-btn", "Change key"); ch.type = "button"; ch.style.margin = "0";
    ch.addEventListener("click", function () { store.set("rp:unsplash", ""); buildPhotos("Paste a new key below."); });
    var foot = el("p", "ph-note"); foot.appendChild(ch);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var term = q.value.trim();
      if (!term) { msg.textContent = "Type what you are looking for."; return; }
      searchPhotos(term, msg, grid);
    });
    photos.appendChild(form); photos.appendChild(msg); photos.appendChild(grid); photos.appendChild(foot);
    q.focus({ preventScroll: true });
  }
  var creditsFixed = 0;
  var searchCtl = null;  // the search in flight; starting a new one (or rebuilding the panel) cancels it so an old answer can't replace newer results
  function searchPhotos(term, msg, grid) {
    msg.textContent = "Searching…"; grid.textContent = "";
    if (searchCtl) searchCtl.abort();
    var ctl = new AbortController(), timedOut = false;
    searchCtl = ctl;
    var timer = setTimeout(function () { timedOut = true; ctl.abort(); }, 10000);
    fetch("https://api.unsplash.com/search/photos?query=" + encodeURIComponent(term) + "&per_page=12", { headers: { Authorization: "Client-ID " + unsplashKey() }, signal: ctl.signal })
      .then(function (r) {
        if (r.status === 401) throw new Error("Unsplash didn't accept this key. Use Change key below to paste it again.");
        if (r.status === 403) throw new Error("Unsplash says the hourly limit has been reached. Try again in a while.");
        if (!r.ok) throw new Error("Unsplash returned an error (" + r.status + "). Try again in a moment.");
        return r.json();
      }).then(function (data) {
        if (ctl !== searchCtl) return;   // a newer search has started
        var list = (data && Array.isArray(data.results) ? data.results : []).filter(function (ph) {
          return ph && ph.urls && typeof ph.urls.regular === "string" && RP.imageOk(ph.urls.regular) && /^https:/.test(ph.urls.regular) && typeof ph.urls.small === "string" && /^https:\/\/images\.unsplash\.com\//.test(ph.urls.small);
        });
        if (!list.length) { msg.textContent = "No photos found for “" + term + "”. Try another word."; return; }
        msg.textContent = list.length + (list.length === 1 ? " photo" : " photos") + ". Choose one to add it to your story.";
        list.forEach(function (ph) {
          var alt = String(ph.alt_description || ph.description || "").slice(0, 200);
          var b = el("button", "ph-tile"); b.type = "button"; b.setAttribute("aria-label", "Use photo" + (alt ? ": " + alt : " by " + (ph.user && ph.user.name || "an Unsplash photographer")));
          var im = el("img"); im.src = ph.urls.small; im.alt = ""; im.loading = "lazy";
          b.appendChild(im);
          b.addEventListener("click", function () { pickPhoto(ph, alt); });
          grid.appendChild(b);
        });
      }).catch(function (e) {
        if (ctl !== searchCtl) return;
        msg.textContent = e && e.name === "AbortError" ? (timedOut ? "Unsplash took too long to answer. Try again." : "Search cancelled.") :
          (e && e.message && !/Failed to fetch|NetworkError|Load failed/.test(e.message) ? e.message : "Couldn't reach Unsplash. Check your connection and try again.");
      }).then(function () { clearTimeout(timer); if (searchCtl === ctl) searchCtl = null; });
  }
  // Unsplash requires the credit "Photo by <name> on Unsplash", linked to the photographer and to Unsplash.
  function creditNodes(name, profile) {
    var cap = el("span");
    cap.appendChild(document.createTextNode("Photo by "));
    var a1 = el("a", null, name); a1.setAttribute("href", withUtm(profile)); cap.appendChild(a1);
    cap.appendChild(document.createTextNode(" on "));
    var a2 = el("a", null, "Unsplash"); a2.setAttribute("href", withUtm("https://unsplash.com/")); cap.appendChild(a2);
    return cap;
  }
  // Puts the credit back under any Unsplash photo whose caption lost it. Anything else typed in the caption stays, after the credit.
  function restoreCredits() {
    var restored = 0;
    qsa(body, "figure.mk-fig[data-remote][data-credit-name]").forEach(function (f) {
      var cap = f.querySelector("figcaption"), name = f.getAttribute("data-credit-name"), url = f.getAttribute("data-credit-url");
      if (!cap || !name || !/^https:\/\/unsplash\.com\//.test(url || "")) return;
      var links = qsa(cap, "a"), text = cap.textContent.replace(/\s+/g, " ").trim();
      var hasPerson = links.some(function (a) { return a.textContent.trim() === name && /^https:\/\/unsplash\.com\//.test(a.getAttribute("href") || ""); });
      var hasSite = links.some(function (a) { return a.textContent.trim() === "Unsplash" && /^https:\/\/unsplash\.com\/(\?|$)/.test(a.getAttribute("href") || ""); });
      if (hasPerson && hasSite && /Photo by .+ on Unsplash/.test(text)) return;
      var extra = text.replace(/Photo by .*? on Unsplash/, "").replace(/^[\s,;:.\-–—]+/, "").trim();
      cap.textContent = "";
      cap.appendChild(creditNodes(name, url));
      if (extra) cap.appendChild(document.createTextNode(" " + extra));
      restored++;
    });
    return restored;
  }
  function pickPhoto(ph, alt) {
    var user = ph.user || {}, name = String(user.name || "an Unsplash photographer").slice(0, 80);
    var profile = user.links && typeof user.links.html === "string" && /^https:\/\/unsplash\.com\//.test(user.links.html) ? user.links.html : "https://unsplash.com/";
    var f = figureOf({ remote: ph.urls.regular, alt: alt, caption: creditNodes(name, profile), creditName: name, creditUrl: profile });
    // Unsplash asks to be told when a photo is used
    var dl = ph.links && ph.links.download_location;
    if (typeof dl === "string" && /^https:\/\/api\.unsplash\.com\//.test(dl)) {
      fetch(dl, { headers: { Authorization: "Client-ID " + unsplashKey() } }).catch(function () {});
    }
    commitBlock(f, "photo", "Photo added. Click it to change its size or description.");
  }

  ins.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-ins]");
    if (!b || !target || !target.parentNode) return;
    var kind = b.getAttribute("data-ins"), tgt = target;
    if (kind === "photos") { photos.hidden = false; buildPhotos(); return; }
    if (kind === "image") {
      pickFile(function (file) {
        addImage(file).then(function (r) {
          if (!r) { closeInserter(true); return; }
          commitBlock(figureOf({ name: r.name }), kind, "Image added. Click it to change its size or add a description.", tgt);
        });
      });
    }
    else if (kind === "video") {
      var vu = window.prompt("Link to a YouTube or Vimeo video", "https://");
      if (vu === null) { closeInserter(true); return; }
      var v = RP.parseVideo(vu);
      if (!v) { wmsg("That doesn't look like a YouTube or Vimeo link."); closeInserter(true); return; }
      commitBlock(RPB.videoCard(v), kind, "Video added. It plays on the published page.");
    }
    else if (kind === "part") commitBlock(RPB.stars(), kind, "New part added.");
    else if (kind === "code") commitBlock(RPB.codeBlock(""), kind, "Code block added.");
    else if (kind === "embed") {
      var u = window.prompt("Link to embed (must start with http:// or https://)", "https://");
      if (u === null) { closeInserter(true); return; }
      u = u.trim();
      var card = RPB.URL_RE.test(u) ? RPB.linkCard(u) : null;
      if (!card) { wmsg("Links must start with http:// or https://."); closeInserter(true); return; }
      commitBlock(card, kind, "Link added.");
    }
  });

  /* ═════════ formatting (selection bar, shortcuts, typing shortcuts) ═════════ */
  function selRange() {
    var s = window.getSelection();
    if (!s.rangeCount || s.isCollapsed) return null;
    var r = s.getRangeAt(0);
    return body.contains(r.commonAncestorContainer) && r.toString().trim() ? r : null;
  }
  function blockValue() { return (document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, ""); }
  function toggleBlock(tag) { document.execCommand("formatBlock", false, blockValue() === tag ? "p" : tag); }
  function blockOf(n) { return closestTag(n, /^(P|H[1-6]|LI|BLOCKQUOTE|FIGCAPTION|PRE)$/); }
  // true when the selection cuts through a private note (starts or ends inside it but doesn't sit wholly inside, or wholly around, it)
  function cutsNote(r) {
    var hit = false;
    Array.prototype.forEach.call(body.querySelectorAll(".mk-note"), function (s) {
      if (!r.intersectsNode(s)) return;
      var sr = document.createRange(); sr.selectNodeContents(s);
      var inside = s.contains(r.startContainer) && s.contains(r.endContainer);
      var around = r.compareBoundaryPoints(Range.START_TO_START, sr) <= 0 && r.compareBoundaryPoints(Range.END_TO_END, sr) >= 0;
      if (!inside && !around) hit = true;
    });
    return hit;
  }
  function linkAt(r) { return closestTag(r.startContainer, /^A$/) || closestTag(r.endContainer, /^A$/) || closestTag(r.commonAncestorContainer, /^A$/); }
  function linkCmd() {
    var sel0 = window.getSelection(), r0 = sel0.rangeCount && body.contains(sel0.anchorNode) ? sel0.getRangeAt(0) : null;
    var existing = r0 ? linkAt(r0) : null;
    if (existing) {   // already a link: remove it
      var all = document.createRange(); all.selectNodeContents(existing);
      sel0.removeAllRanges(); sel0.addRange(all);
      edit(function () { document.execCommand("unlink"); });
      wmsg("Link removed.");
      return;
    }
    var r = selRange();
    if (!r) { wmsg("Select some words first, then add a link."); return; }
    var saved = r.cloneRange();
    var u = window.prompt("Link address (must start with http:// or https://)", "https://");
    if (u === null) return;
    u = u.trim();
    if (!RPB.URL_RE.test(u)) { wmsg("Links must start with http:// or https://."); return; }
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(saved);
    edit(function () { document.execCommand("createLink", false, u); });
    Array.prototype.forEach.call(body.querySelectorAll("a[href]"), function (a) { a.target = "_blank"; a.rel = "noopener"; });
    wmsg("Link added.");
  }
  var NOTE_CUT = "That selection cuts through a private note. Select the whole note or text outside it.";
  function runCmd(cmd) {
    if (/^(bold|italic|link)$/.test(cmd)) {
      var rr = selRange();
      if (rr && cutsNote(rr)) { wmsg(NOTE_CUT); return; }
    }
    if (cmd === "bold" || cmd === "italic") edit(function () { document.execCommand(cmd); });
    else if (cmd === "h2" || cmd === "h3" || cmd === "quote") edit(function () { toggleBlock(cmd === "quote" ? "blockquote" : cmd); });
    else if (cmd === "link") linkCmd();
    else if (cmd === "note") noteCmd();
    afterEdit(); updateBar();
  }

  /* ── private notes (only the writer sees them; never part of the published text) ── */
  function spanFor(id) { return body.querySelector('.mk-note[data-note-id="' + id + '"]'); }
  function noteSpan(n) {
    while (n && n !== body) { if (n.nodeType === 1 && n.classList.contains("mk-note")) return n; n = n.parentNode; }
    return null;
  }
  function unwrapNote(id) {
    var s = spanFor(id);
    if (!s) return;
    var p = s.parentNode;
    while (s.firstChild) p.insertBefore(s.firstChild, s);
    s.remove(); p.normalize();
  }
  function noteCmd() {
    var r = selRange();
    if (!r) { wmsg("Select some words first to add a private note."); return; }
    var ex = noteSpan(r.commonAncestorContainer);
    if (ex) { openNote(ex.getAttribute("data-note-id"), false); return; }
    var b1 = blockOf(r.startContainer), b2 = blockOf(r.endContainer);
    if (!b1 || b1 !== b2 || b1.nodeName === "PRE" || b1.nodeName === "FIGCAPTION") { wmsg("A note works on words inside one paragraph."); return; }
    if (r.cloneContents().querySelector(".mk-note")) { wmsg("Part of that text already has a note."); return; }
    noteStep = pushUndo();
    var id = "n" + (++noteSeq), span = el("span", "mk-note");
    span.setAttribute("data-note-id", id);
    span.appendChild(r.extractContents()); r.insertNode(span);
    NOTES[id] = "";
    window.getSelection().removeAllRanges();
    hideBar();
    openNote(id, true);
  }
  function placeNotePop() {
    var s = openNoteId && spanFor(openNoteId);
    if (!s) return;
    var rect = s.getBoundingClientRect();
    notePop.style.left = "8px"; notePop.style.top = "0px";
    var w = notePop.offsetWidth, h = notePop.offsetHeight;
    var top = rect.bottom + 10; if (top + h > window.innerHeight - 8) top = rect.top - h - 10;
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    notePop.style.top = top + "px";
    notePop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8)) + "px";
  }
  function openNote(id, isNew) {
    openNoteId = id; noteNew = isNew;
    $("note-text").value = NOTES[id] || ""; $("note-err").textContent = "";
    $("note-del").hidden = isNew;
    notePop.hidden = false; placeNotePop();
    $("note-text").focus({ preventScroll: true });
  }
  function closeNote(mode) {   // "save", "cancel" or "delete"
    var id = openNoteId;
    if (id === null) return;
    if (mode === "save") {
      var t = $("note-text").value.trim();
      if (!t) { $("note-err").textContent = "Write a note first, or choose Cancel."; $("note-text").focus(); return; }
      if (!noteNew && NOTES[id] !== t) pushUndo();
      NOTES[id] = t; wmsg("Private note saved. Only you can see it, and it is never published.");
    } else if (mode === "delete" || (mode === "cancel" && noteNew)) {
      if (mode === "delete") pushUndo();
      else if (noteStep && undoStack[undoStack.length - 1] === noteStep) { undoStack.pop(); updateUndo(); }   // the note was never made: forget the step
      unwrapNote(id); delete NOTES[id];
      if (mode === "delete") wmsg("Private note deleted.");
    }
    openNoteId = null; notePop.hidden = true; noteStep = null;
    renderMarks(); touched();
    var m = marks.querySelector('[data-note-id="' + id + '"]');
    if (m && mode === "save") m.focus({ preventScroll: true }); else body.focus({ preventScroll: true });
  }
  $("note-save").addEventListener("click", function () { closeNote("save"); });
  $("note-cancel").addEventListener("click", function () { closeNote("cancel"); });
  $("note-del").addEventListener("click", function () { closeNote("delete"); });
  $("note-text").addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); closeNote("save"); } });
  function noteDirty() { return openNoteId !== null && $("note-text").value.trim() !== (NOTES[openNoteId] || "").trim(); }
  document.addEventListener("mousedown", function (e) {
    if (openNoteId === null || notePop.contains(e.target)) return;
    closeNote(noteDirty() ? "save" : "cancel");   // clicking away saves what you typed
  });
  // Numbered markers sit in the right margin on wide screens, or just after the text on narrow ones.
  function renderMarks() {
    if (view !== "write") return;
    marks.textContent = "";
    var wrap = $("wr-wrap").getBoundingClientRect(), wide = window.innerWidth >= 900, n = 0;
    var seen = {};
    qsa(body, ".mk-note").forEach(function (s) {
      var id = s.getAttribute("data-note-id");
      if (seen[id]) { var q = s.parentNode; while (s.firstChild) q.insertBefore(s.firstChild, s); s.remove(); q.normalize(); return; }   // a split copy of a note
      seen[id] = true;
      if (!(id in NOTES)) { var p = s.parentNode; while (s.firstChild) p.insertBefore(s.firstChild, s); s.remove(); p.normalize(); return; }   // a note that no longer exists
      if (!NOTES[id]) return;   // still being written
      var rects = s.getClientRects();
      if (!rects.length) return;
      n++;
      var rc = wide ? rects[0] : rects[rects.length - 1];
      var b = el("button", "mk-mark", String(n)); b.type = "button";
      b.setAttribute("data-note-id", id);
      b.setAttribute("aria-label", "Private note " + n + ". Open it to edit or delete.");
      b.title = "Private note " + n;
      b.style.top = (rc.top - wrap.top + (wide ? 4 : -8)) + "px";
      b.style.left = (wide ? wrap.width + 14 : Math.min(rc.right - wrap.left + 2, wrap.width - 20)) + "px";
      b.addEventListener("click", function () { openNote(id, false); });
      marks.appendChild(b);
    });
  }
  window.addEventListener("resize", function () { renderMarks(); if (openNoteId !== null) placeNotePop(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { renderMarks(); updatePlus(); });

  /* ── selection bar ── */
  function hideBar() { selBar.hidden = true; }
  function updateBar() {
    if (view !== "write") { hideBar(); return; }
    var r = selRange();
    if (!r) { hideBar(); return; }
    hideImgBar(false);
    var rect = r.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { hideBar(); return; }
    selBar.style.left = "8px"; selBar.style.top = "0px"; selBar.hidden = false;
    var w = selBar.offsetWidth, h = selBar.offsetHeight;
    var below = false, top = rect.top - h - 10;
    if (top < 8) { top = rect.bottom + 10; below = true; }
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    var left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
    selBar.style.top = top + "px"; selBar.style.left = left + "px";
    selBar.classList.toggle("below", below);
    selBar.style.setProperty("--caret-x", Math.max(16, Math.min(rect.left + rect.width / 2 - left, w - 16)) + "px");
    var bv = blockValue(), node = r.commonAncestorContainer;
    var st = {
      bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), h2: bv === "h2", h3: bv === "h3", quote: bv === "blockquote",
      link: !!linkAt(r), note: !!noteSpan(node)
    };
    Array.prototype.forEach.call(selBar.querySelectorAll("button[data-cmd]"), function (b) {
      var c = b.getAttribute("data-cmd"); if (c in st) pressed(b, st[c]);
    });
  }
  document.addEventListener("selectionchange", function () { dropTempLines(); updateBar(); updatePlus(); });
  window.addEventListener("scroll", function () { if (view === "write") updateBar(); if (!imgBar.hidden) placeImgBar(); if (openNoteId !== null) placeNotePop(); }, { passive: true });
  window.addEventListener("resize", function () { if (view !== "write") return; fitAll(); updatePlus(); if (!selBar.hidden) updateBar(); if (!imgBar.hidden) placeImgBar(); });
  selBar.addEventListener("mousedown", function (e) { e.preventDefault(); });
  selBar.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cmd]");
    if (!b || !selRange()) return;
    runCmd(b.getAttribute("data-cmd"));
  });

  var dragInside = false;   // true while something is being dragged from inside the story (the browser moves it natively)
  body.addEventListener("dragstart", function () { dragInside = true; });
  document.addEventListener("pointerup", function () { dragInside = false; });
  document.addEventListener("drop", function () { setTimeout(function () { dragInside = false; }, 0); });
  body.addEventListener("drop", function (e) {
    if (dragInside) return;
    e.preventDefault();   // only plain text may be dropped in
    var t = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
    if (!t) return;
    pushUndo();
    try {
      var r = null;
      if (document.caretRangeFromPoint) r = document.caretRangeFromPoint(e.clientX, e.clientY);
      else if (document.caretPositionFromPoint) { var cp = document.caretPositionFromPoint(e.clientX, e.clientY); r = document.createRange(); r.setStart(cp.offsetNode, cp.offset); r.collapse(true); }
      if (r && body.contains(r.startContainer)) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }
    } catch (err) {}
    body.focus({ preventScroll: true });
    batch++;
    try { document.execCommand("insertText", false, t); } finally { batch--; }
  });
  body.addEventListener("dragover", function (e) { if (!dragInside) e.preventDefault(); });

  /* ── typing shortcuts and keyboard shortcuts ── */
  var MARKERS = { "#": "h2", "##": "h3", ">": "quote", "-": "ul", "*": "ul", "1.": "ol" };
  function caretInfo() {
    var s = window.getSelection();
    if (!s.rangeCount || !s.isCollapsed || !body.contains(s.anchorNode)) return null;
    var b = curBlock();
    if (!b) return null;
    var r = document.createRange(); r.selectNodeContents(b); r.setEnd(s.anchorNode, s.anchorOffset);
    return { block: b, before: r.toString(), range: r };
  }
  function applyMarker(kind) {
    if (kind === "ul") document.execCommand("insertUnorderedList");
    else if (kind === "ol") document.execCommand("insertOrderedList");
    else document.execCommand("formatBlock", false, kind === "quote" ? "blockquote" : kind);
  }
  // Enter on an empty list item: the item becomes a normal paragraph after the list (a longer list is split in two).
  function exitList(li) {
    var list = li.parentNode, p = RPB.para("");
    if (list.parentNode !== body) { document.execCommand(list.nodeName === "OL" ? "insertOrderedList" : "insertUnorderedList"); return; }
    var after = [], n = li.nextSibling, hadBefore = !!li.previousElementSibling;
    while (n) { after.push(n); n = n.nextSibling; }
    li.remove();
    if (after.length) {
      var rest = list.cloneNode(false);
      after.forEach(function (x) { rest.appendChild(x); });
      body.insertBefore(rest, list.nextSibling);
      body.insertBefore(p, rest);
    } else if (list.nextElementSibling && isEmptyPara(list.nextElementSibling)) p = list.nextElementSibling;   // reuse the empty line already there
    else body.insertBefore(p, list.nextSibling);
    if (!hadBefore) list.remove();
    placeCaret(p);
  }
  // True when the caret sits on a blank last line of a code block (after a line break, with nothing after it).
  function emptyLastLine(pre, sel) {
    if (sel.anchorNode !== pre) return false;
    var kids = pre.childNodes, o = sel.anchorOffset, i, brs = 0;
    if (!kids.length) return true;
    if (!kids[o - 1] || kids[o - 1].nodeName !== "BR") return false;
    for (i = o; i < kids.length; i++) { if (kids[i].nodeName !== "BR") return false; brs++; }
    return brs <= 1;
  }
  function exitCode(pre) {
    while (pre.lastChild && pre.lastChild.nodeName === "BR") pre.lastChild.remove();
    var nx = pre.nextElementSibling;
    if (!nx || nx.nodeName !== "P") { nx = RPB.para(""); body.insertBefore(nx, pre.nextSibling); }
    placeCaret(nx);
  }
  body.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey, k = (e.key || "").toLowerCase(), ci;
    if (historyKey(e)) return;
    // keyboard on a picture, divider or card that has been selected (clicked or tabbed to)
    if (isBlockNode(e.target)) {
      var sb = e.target;
      if (sb.nodeName === "FIGURE" && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showImgBar(sb, true); return; }
      if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); dropBlock(sb, sb.nodeName === "FIGURE" ? "Image removed." : "Block removed."); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hideImgBar(false); caretBeside(sb, true); return; }
      if (!mod && !e.altKey && !e.shiftKey) {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); caretBeside(sb, true); return; }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); caretBeside(sb, false); return; }
      }
      // typing or Enter: the cursor moves to the line after and the key goes through there
      if (!mod && !e.altKey && !e.isComposing && (e.key.length === 1 || e.key === "Enter")) caretBeside(sb, true);
      return;
    }
    if (e.target.nodeName === "FIGCAPTION" && e.key === "Enter") {   // a caption is one line: Enter moves on
      e.preventDefault();
      pushUndo();
      var fg = e.target.closest("figure"), nx = fg.nextElementSibling;
      if (!nx || nx.nodeName !== "P") { nx = RPB.para(""); body.insertBefore(nx, fg.nextSibling); }
      placeCaret(nx); afterEdit();
      return;
    }
    // shortcuts with Ctrl / Cmd
    if (mod && !e.altKey) {
      var cmd = null;
      if (!e.shiftKey && k === "b") cmd = "bold";
      else if (!e.shiftKey && k === "i") cmd = "italic";
      else if (!e.shiftKey && k === "k") cmd = "link";
      else if (e.shiftKey && e.key === "Enter") {   // from a text line: new empty line below, with the plus menu open
        e.preventDefault();
        var cb = curBlock();
        if (!cb) return;
        pushUndo();
        var nb = cb.nextElementSibling, np = isEmptyPara(cb) ? cb : isEmptyPara(nb) ? nb : null;
        if (!np) { np = RPB.para(""); body.insertBefore(np, cb.nextSibling); }
        placeCaret(np); afterEdit(); openInserter(true);
        return;
      }
      if (cmd) { e.preventDefault(); runCmd(cmd); return; }
    }
    if (mod || e.altKey) return;
    if ((e.key === "Backspace" || e.key === "Delete") && deleteKey(e)) return;
    // typing shortcuts: marker then a space
    if (e.key === " ") {
      ci = caretInfo();
      if (ci && ci.block.nodeName === "P" && MARKERS[ci.before]) {
        e.preventDefault();
        var s = window.getSelection(), kind = MARKERS[ci.before], an = s.anchorNode, ao = s.anchorOffset;
        edit(function () {
          s.removeAllRanges(); s.addRange(ci.range);
          document.execCommand("delete");
          applyMarker(kind);
        }, { node: an, off: ao });
        afterEdit();
      }
      return;
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    ci = caretInfo();
    var sel = window.getSelection();
    // Enter on an empty list item leaves the list
    var li = sel.rangeCount && sel.isCollapsed ? closestTag(sel.anchorNode, /^LI$/) : null;
    if (li && !li.textContent.trim()) {
      e.preventDefault();
      edit(function () { exitList(li); });
      afterEdit(); return;
    }
    // Enter on an empty quote line leaves the quote
    var bq = sel.rangeCount && sel.isCollapsed ? closestTag(sel.anchorNode, /^BLOCKQUOTE$/) : null;
    if (bq && !bq.textContent.trim()) { e.preventDefault(); edit(function () { document.execCommand("formatBlock", false, "p"); }); afterEdit(); return; }
    if (ci && ci.block.nodeName === "P") {
      var text = ci.block.textContent.trim();
      if (text === "---") {                       // new part
        e.preventDefault();
        pushUndo();
        body.insertBefore(RPB.stars(), ci.block);
        ci.block.textContent = ""; ci.block.appendChild(document.createElement("br"));
        placeCaret(ci.block); wmsg("New part added."); afterEdit(); return;
      }
      if (text === "```") {                       // code block
        e.preventDefault();
        pushUndo();
        var pre = RPB.codeBlock("");
        body.replaceChild(pre, ci.block); ensureTrailing(); placeCaret(pre);
        wmsg("Code block added."); afterEdit(); return;
      }
    }
    var codeEl = sel.rangeCount ? closestTag(sel.anchorNode, /^PRE$/) : null;
    if (codeEl) {   // new line inside code; Enter on an empty last line leaves the code block
      e.preventDefault();
      if (sel.isCollapsed && emptyLastLine(codeEl, sel)) edit(function () { exitCode(codeEl); });
      else { onBeforeInput({ inputType: "insertText", data: " " }, "body"); batch++; try { document.execCommand("insertLineBreak"); } finally { batch--; } }
      afterEdit();
    }
  });

  /* ═════════ pictures: size, description, replace, remove ═════════ */
  function hideImgBar(restore) {
    if (imgBar.hidden) return;
    imgBar.hidden = true;
    if (curFig) { curFig.classList.remove("sel"); if (restore) curFig.focus({ preventScroll: true }); }
    curFig = null;
  }
  function placeImgBar() {
    if (!curFig) return;
    var rect = curFig.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) { imgBar.style.visibility = "hidden"; return; }
    imgBar.style.visibility = "";
    imgBar.style.left = "8px"; imgBar.style.top = "0px";
    var w = imgBar.offsetWidth, h = imgBar.offsetHeight;
    var top = rect.top - h - 8; if (top < 8) top = Math.min(rect.top + 8, window.innerHeight - h - 8);
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    var left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
    imgBar.style.top = top + "px"; imgBar.style.left = left + "px";
  }
  function showImgBar(fig, focusIt) {
    if (curFig && curFig !== fig) curFig.classList.remove("sel");
    curFig = fig; fig.classList.add("sel");
    hideBar();
    Array.prototype.forEach.call(imgBar.querySelectorAll("button[data-size]"), function (b) { pressed(b, b.getAttribute("data-size") === (fig.dataset.size || "normal")); });
    $("img-alt").value = fig.dataset.alt || "";
    var fr = fig.getBoundingClientRect();
    if (fr.bottom < 0 || fr.top > window.innerHeight) fig.scrollIntoView({ block: "center" });
    imgBar.hidden = false; placeImgBar();
    if (focusIt) $("img-alt").focus({ preventScroll: true });
  }
  function removeFigure(fig) { dropBlock(fig, "Image removed."); }
  body.addEventListener("click", function (e) {
    var nb = e.target.closest ? e.target.closest(".mk-stars, .mk-embed") : null;
    if (nb && nb.parentNode === body) nb.focus({ preventScroll: true });   // selected: Backspace or Delete removes it
    var fig = e.target.closest ? e.target.closest("figure.mk-fig") : null;
    if (fig && !e.target.closest("figcaption")) showImgBar(fig, false);
    else if (!fig) hideImgBar(false);
  });
  document.addEventListener("click", function (e) {
    if (!imgBar.hidden && !imgBar.contains(e.target) && !body.contains(e.target)) hideImgBar(false);
  });
  imgBar.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b || !curFig) return;
    var size = b.getAttribute("data-size"), act = b.getAttribute("data-act");
    if (size) {
      pushUndo();
      curFig.dataset.size = size;
      curFig.classList.toggle("wide", size === "wide"); curFig.classList.toggle("full", size === "full");
      Array.prototype.forEach.call(imgBar.querySelectorAll("button[data-size]"), function (x) { pressed(x, x === b); });
      wmsg("Image size: " + { normal: "normal", wide: "wide", full: "full width" }[size] + ".");
      placeImgBar(); touched();
    } else if (act === "replace") {
      var fig = curFig;
      pickFile(function (file) {
        addImage(file).then(function (r) {
          if (!r || !fig.parentNode) return;
          pushUndo();
          fig.dataset.name = r.name; fig.removeAttribute("data-remote"); fig.removeAttribute("data-path"); fig.removeAttribute("data-credit-name"); fig.removeAttribute("data-credit-url"); fig.classList.remove("missing");
          fig.querySelector("img").src = r.url;
          var cap = fig.querySelector("figcaption");
          if (cap && /on Unsplash$/.test(cap.textContent)) cap.textContent = "";   // the old credit no longer applies
          wmsg("Image replaced."); afterEdit();
        });
      });
    } else if (act === "remove") removeFigure(curFig);
    else if (act === "done") hideImgBar(true);
  });
  $("img-alt").addEventListener("input", function () {
    if (!curFig) return;
    var v = $("img-alt").value;
    curFig.dataset.alt = v;
    curFig.querySelector("img").alt = v.trim();
    touched();
  });
  $("img-alt").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); hideImgBar(true); } });

  /* ═════════ leaving things with Escape ═════════ */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || view !== "write") return;
    if (openNoteId !== null) { if (!noteDirty() || window.confirm("Discard this note?")) closeNote("cancel"); return; }
    if (!$("goal-form").hidden) { closeGoal(false); return; }
    if (!imgBar.hidden) { hideImgBar(true); return; }
    if (!selBar.hidden) { hideBar(); body.focus({ preventScroll: true }); var s = window.getSelection(); if (s.rangeCount && body.contains(s.anchorNode)) s.collapseToEnd(); return; }
    if (insOpen() || !photos.hidden) { closeInserter(true); return; }
  });

  /* ═════════ publish screen ═════════ */
  function renderChips() {
    var box = $("chips"); box.textContent = "";
    S.tags.forEach(function (t) {
      var b = el("button", null, t + " ×"); b.type = "button"; b.setAttribute("aria-label", "Remove topic " + t);
      b.addEventListener("click", function () {
        var at = S.tags.indexOf(t);
        S.tags.splice(at, 1); $("topic-msg").textContent = "Removed “" + t + "”."; renderChips(); touched();
        var next = $("chips").children[at];   // the chip that took its place, else the input
        (next || $("topic-in")).focus();
      });
      box.appendChild(b);
    });
  }
  function addTopic() {
    var inp = $("topic-in"), t = inp.value.replace(/,/g, "").trim().toLowerCase().slice(0, 30);
    if (!t) return;
    if (S.tags.indexOf(t) >= 0) { $("topic-msg").textContent = "“" + t + "” is already added."; inp.value = ""; return; }
    if (S.tags.length >= 5) { $("topic-msg").textContent = "You can add up to 5 topics. Remove one to add another."; return; }
    S.tags.push(t); inp.value = ""; $("topic-msg").textContent = "Added “" + t + "”."; renderChips(); touched();
  }
  $("topic-in").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTopic(); } });

  function previewUrl() {
    if (!S.preview) return "";
    if (S.preview.name) return urlCache[S.preview.name] || "";
    return S.preview.remote || "";
  }
  function counters() {
    $("pub-title-n").textContent = $("pub-title").value.length + " / 100";
    $("pub-sub-n").textContent = $("pub-sub").value.length + " / 140";
    $("card-t").textContent = $("pub-title").value || "Untitled story";
    $("card-s").textContent = $("pub-sub").value;
    var u = previewUrl();
    $("card-im").style.backgroundImage = u ? 'url("' + u + '")' : "";
  }
  ["pub-title", "pub-sub"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      S.dispTouched = true; S.displayTitle = $("pub-title").value; S.displaySubtitle = $("pub-sub").value; counters(); touched();
    });
  });
  function storyImages() {
    var list = [], seen = {};
    qsa(body, "figure.mk-fig").forEach(function (f) {
      var name = f.getAttribute("data-name"), remote = f.getAttribute("data-remote");
      if (name && RPB.NAME_RE.test(name) && !seen["n" + name]) { seen["n" + name] = 1; list.push({ name: name, url: urlCache[name] || "" }); }
      else if (remote && RP.imageOk(remote) && !seen["r" + remote]) { seen["r" + remote] = 1; list.push({ remote: remote, url: remote }); }
    });
    return list;
  }
  function samePick(a, b) { return !!a && !!b && (a.name ? a.name === b.name : a.remote === b.remote); }
  function renderPicker() {
    var grid = $("pv-grid"), imgs = storyImages();
    if (S.preview && !imgs.some(function (i) { return samePick(i, S.preview); })) S.preview = null;   // that picture is no longer in the story
    grid.textContent = "";
    var none = el("button", "pick-tile", "No image"); none.type = "button"; pressed(none, !S.preview);
    none.addEventListener("click", function () { S.preview = null; renderPicker(); counters(); touched(); });
    grid.appendChild(none);
    imgs.forEach(function (im, i) {
      var b = el("button", "pick-tile"); b.type = "button"; b.setAttribute("aria-label", "Use picture " + (i + 1) + " from your story");
      pressed(b, samePick(im, S.preview));
      var t = el("img"); t.alt = ""; if (im.url) t.src = im.url;
      b.appendChild(t);
      b.addEventListener("click", function () { S.preview = im.name ? { name: im.name } : { remote: im.remote }; renderPicker(); counters(); touched(); });
      grid.appendChild(b);
    });
    $("pv-hint").textContent = imgs.length ? "The image people see when the story is shared." : "Add a picture to your story to use it as the preview image.";
  }
  function updateLabel() {
    var on = $("sched-on").checked;
    $("sched-fields").hidden = !on;
    $("pub-go").textContent = on ? "Schedule" : "Publish now";
  }
  ["dropcap", "canon", "sched-on", "sched-date", "sched-time"].forEach(function (id) {
    $(id).addEventListener("change", function () { readPublishFields(); updateLabel(); touched(); });
  });
  qsa(document, "input[name=vis]").forEach(function (r) { r.addEventListener("change", function () { readPublishFields(); touched(); }); });
  $("canon").addEventListener("input", function () { S.canonical = $("canon").value; touched(); });
  function readPublishFields() {
    S.dropCap = $("dropcap").checked;
    S.visibility = document.querySelector("input[name=vis]:checked").value;
    S.schedOn = $("sched-on").checked; S.schedDate = $("sched-date").value; S.schedTime = $("sched-time").value;
    S.canonical = $("canon").value;
  }
  function enterPublish() {
    if (!S.dispTouched) {
      S.displayTitle = $("wr-title").value.trim().slice(0, 100);
      S.displaySubtitle = $("wr-sub").value.trim().slice(0, 140);
    }
    $("pub-title").value = S.displayTitle; $("pub-sub").value = S.displaySubtitle;
    $("dropcap").checked = S.dropCap;
    qsa(document, "input[name=vis]").forEach(function (r) { r.checked = r.value === S.visibility; });
    $("sched-on").checked = S.schedOn;
    var now = RP.klNow();
    $("sched-date").min = now.date;
    $("sched-date").value = S.schedDate && S.schedDate >= now.date ? S.schedDate : now.date;
    $("sched-time").value = S.schedTime;
    $("canon").value = S.canonical;
    renderChips(); renderPicker(); counters(); updateLabel();
    if (DRAFT.partial || DRAFT.partialSlug) $("pub-err").textContent = "Your last attempt saved some files but didn't finish. Press Publish to finish it.";
    else if (!$("pub-result").children.length) $("pub-err").textContent = "";
  }
  $("pub-back").addEventListener("click", function () { location.hash = "#/write"; });
  $("wr-publish").addEventListener("click", function () { location.hash = "#/publish"; });

  function setBusy(on) {
    $("view-publish").inert = on;
    $("pub-go").textContent = on ? "Publishing…" : ($("sched-on").checked ? "Schedule" : "Publish now");
  }
  function showError(msg) { $("pub-err").textContent = msg; }
  function intro() {
    var r = $("pub-result");
    r.textContent = "";
    r.appendChild(el("p", null, "Choose your rumi-pulp folder (the one that contains index.html). You only need to do this once; your browser will remember it."));
    var b = el("button", "btn primary", "Choose folder"); b.type = "button";
    b.addEventListener("click", function () { doPublish(true); });
    r.appendChild(b); r.hidden = false;
    b.focus();
  }
  function success(res, post, remembered, creditsRestored) {
    finished = true; clearTimeout(saveT);
    RPO.removeDraft(DRAFT.id); RPO.imgDrop(DRAFT.id);
    var r = $("pub-result");
    r.textContent = ""; r.hidden = false; $("pub-err").textContent = "";
    var what = post.publishAt ? "Scheduled “" + res.entry.title + "”. Hidden on your blog until " + RP.klLabel(post.publishAt) + "."
      : post.visibility === "unlisted" ? "Published “" + res.entry.title + "” as unlisted. Only people with the link can read it."
      : "Published “" + res.entry.title + "”.";
    r.appendChild(el("p", null, what + " It's saved in your rumi-pulp folder. To put it online, commit and push (GitHub Desktop: Commit to main → Push origin)."
      + (post.publishAt ? " Its text file is on GitHub, so someone with the exact link could read it early." : "")
      + (res.detached ? " The address of the story you were editing now belongs to a different post, so this was published as a new story." : "")
      + (creditsRestored ? " The Unsplash photo credit was put back under " + (creditsRestored === 1 ? "a photo" : creditsRestored + " photos") + "." : "")
      + (remembered ? "" : " Couldn't remember the folder; you'll be asked again next time.")));
    var ul = el("ul");
    ["posts/" + res.slug + ".md: your story text",
     "posts/" + res.slug + ".html: a small page for Google and social previews",
     "posts/index.json: the list of stories",
     "feed.xml: the RSS feed"].forEach(function (t) { ul.appendChild(el("li", null, t)); });
    if (post.images.length) ul.appendChild(el("li", null, "posts/images/" + res.slug + "/: " + post.images.length + (post.images.length === 1 ? " picture" : " pictures")));
    r.appendChild(ul);
    var links = el("p"); links.style.marginTop = "12px";
    var v = el("a", null, "View it"); v.href = "post.html?slug=" + encodeURIComponent(res.slug) + (post.publishAt ? "&preview=1" : "");
    var s = el("a", null, "Back to your stories"); s.href = "stories.html"; s.style.marginLeft = "16px";
    links.appendChild(v); links.appendChild(s); r.appendChild(links);
    $("pub-go").disabled = true; $("pub-back").disabled = true;
    v.focus();
  }

  function doPublish(pick) {
    if (publishing || finished) return;
    var res = $("pub-result");
    res.hidden = true; res.textContent = ""; showError("");
    readPublishFields();
    var title = $("wr-title").value.trim();
    var dTitle = $("pub-title").value.trim(), dSub = $("pub-sub").value.trim(), sub = $("wr-sub").value.trim();
    if (!title) { showError("Add a title to your story first."); return; }
    creditsFixed += restoreCredits();    // (kept across the "choose folder" step, which calls this again)
    var creditsRestored = creditsFixed;
    var frag = clean();
    if (!RPB.wordCount(frag) && !frag.querySelector("figure")) { showError("The story is empty. Write something first."); return; }
    if (!RP.slugify(title)) { showError("Use letters or numbers in the title so the story has a web address."); return; }
    if (!dTitle) { showError("Add a display title with letters or numbers."); $("pub-title").focus(); return; }
    var canon = S.canonical.trim();
    if (canon && !/^https:\/\/[^\s]+$/i.test(canon)) { showError("The canonical link must start with https://"); $("canon").focus(); return; }
    var publishAt = "";
    if (S.schedOn) {
      if (!S.schedDate || !S.schedTime) { showError("Choose a date and time for the schedule."); return; }
      publishAt = RP.klIso(S.schedDate, S.schedTime);
      if (!(Date.parse(publishAt) > Date.now())) { showError("That time has already passed in Kuala Lumpur. Pick a later date or time."); return; }
    }
    if (!RPO.HAS_PICKER) { showError(NOT_CHROME); return; }
    var names = {};
    qsa(frag, "figure[data-name]").forEach(function (f) { names[f.getAttribute("data-name")] = 1; });
    var post = {
      title: title, subtitle: sub, summary: RPB.summaryOf(frag), words: RPB.wordCount(frag), tags: S.tags.slice(), dropCap: S.dropCap,
      visibility: S.visibility, publishAt: publishAt, canonical: canon,
      displayTitle: dTitle !== title ? dTitle : "", displaySubtitle: dSub !== sub ? dSub : "",
      preview: S.preview, images: [], buildMd: function (slug) { return RPB.toMarkdown(frag, slug); }
    };
    publishing = true; setBusy(true);
    persist(false);
    (async function () {
      try {
        for (var name in names) {
          var blob = await RPO.imgGet(DRAFT.id, name);
          if (!blob) throw new RPO.PublishError("A picture in the story (" + name + ") is missing from this browser. Replace or remove it, then publish again.");
          post.images.push({ name: name, blob: blob });
        }
        var repo = await RPO.openRepo(pick === true);
        if (!repo) { intro(); return; }
        var out = await RPO.publish(repo.dir, post, {
          editSlug: DRAFT.editSlug, editId: DRAFT.postId, editDate: DRAFT.editDate,
          partialSlug: DRAFT.partialSlug, partialId: DRAFT.partialId, partialDate: DRAFT.partialDate
        });
        success(out, post, repo.remembered, creditsRestored);
      } catch (e) {
        if (e && e.partial) {
          if (e.editing) {     // the published story is half updated: the retry finishes it
            DRAFT.editSlug = e.slug; DRAFT.postId = e.id; DRAFT.editDate = e.date; DRAFT.partial = true;
            showError("Some files were saved but the list wasn't fully updated. Press Publish again to finish. (" + (e.message || "unknown error") + ")");
          } else {             // a first publish failed and its files could not be removed: remember them
            DRAFT.partialSlug = e.slug; DRAFT.partialId = e.id; DRAFT.partialDate = e.date;
            showError("Publishing failed (" + (e.message || "unknown error") + ") and some of its files are still in your folder (posts/" + e.slug + "…). Press Publish again to finish, or delete this draft in Your stories to clean them up.");
          }
          persist(false);
        } else if (e && e.cleaned) {
          showError("Publishing didn't finish (" + (e.message || "unknown error") + "). The files it had saved were removed again, so nothing half-done is left in your folder. Your draft is still here.");
        } else if (e && e.name === "AbortError") showError("Publishing cancelled.");
        else if (e instanceof RPO.PublishError) showError(e.message);
        else showError(RPO.explain(e) + " Your draft is still here.");
      } finally {
        publishing = false;
        setBusy(false);
      }
    })();
  }
  $("pub-go").addEventListener("click", function () { doPublish(false); });

  /* ═════════ opening a story ═════════ */
  function loadRecord(rec) {
    DRAFT.id = rec.id;
    DRAFT.existed = true;
    DRAFT.editSlug = RPO.validSlug(rec.editSlug) ? rec.editSlug : null;
    DRAFT.postId = DRAFT.editSlug && typeof rec.postId === "string" ? rec.postId : "";
    DRAFT.editDate = DRAFT.editSlug && RPO.validDate(rec.editDate) ? rec.editDate : null;
    DRAFT.partial = !!(DRAFT.editSlug && rec.partial);
    DRAFT.partialSlug = RPO.validSlug(rec.partialSlug) ? rec.partialSlug : null;
    DRAFT.partialId = DRAFT.partialSlug && typeof rec.partialId === "string" ? rec.partialId : "";
    DRAFT.partialDate = DRAFT.partialSlug && RPO.validDate(rec.partialDate) ? rec.partialDate : null;
    DRAFT.fromSlug = RPO.validSlug(rec.fromSlug) ? rec.fromSlug : null;
    $("wr-title").value = String(rec.title || ""); $("wr-sub").value = String(rec.subtitle || ""); fitAll();
    NOTES = {};
    if (RPO.isObj(rec.notes)) Object.keys(rec.notes).forEach(function (k) { if (/^n\d+$/.test(k) && typeof rec.notes[k] === "string") NOTES[k] = rec.notes[k]; });
    noteSeq = Number(rec.noteSeq) || 0;
    Object.keys(NOTES).forEach(function (id) { var n = Number(id.slice(1)); if (n > noteSeq) noteSeq = n; });
    goal = Number.isInteger(rec.goal) && rec.goal >= 1 && rec.goal <= 100000 ? rec.goal : 800;
    applySettings(RPO.isObj(rec.settings) ? rec.settings : { tags: parseTagString(rec.tags) });
    var frag;
    if (typeof rec.html === "string") frag = RPB.fromHtml(rec.html);
    else if (typeof rec.body === "string") frag = RPB.fromMarkdown(rec.body);   // text saved as markdown: rendered into the editor once
    else frag = document.createDocumentFragment();
    setBody(frag);
    resetUndo();
  }
  function newStory() {
    DRAFT.id = RPO.newId();
    setBody(document.createDocumentFragment());
    resetUndo();
  }
  async function openPublished(slug) {
    wmsg("Opening the story…");
    var all, p, text;
    try {
      all = await RP.loadPosts();
      p = all.filter(function (x) { return x.slug === slug; })[0];
      if (!p) throw new Error("that story isn't in the list of published stories");
      var r = await fetch("posts/" + slug + ".md", { cache: "no-cache" });
      if (!r.ok) throw new Error("the story file returned " + r.status);
      text = await r.text();
    } catch (e) {
      newStory();
      wmsg("Couldn't open that story: " + (e && e.message ? e.message : "unknown error") + ". This is a new story instead.");
      return;
    }
    var pi = null;
    if (p.image) { var mm = /^images\/[^/]+\/(.+)$/.exec(p.image); pi = mm ? { name: mm[1] } : { remote: p.image }; }
    loadRecord({
      id: RPO.newId(), title: p.title, subtitle: p.subtitle, body: text, editSlug: slug, postId: p.id, editDate: p.date,
      settings: {
        displayTitle: p.displayTitle, displaySubtitle: p.displaySubtitle, tags: p.tags, dropCap: p.dropCap, visibility: p.visibility === "unlisted" ? "unlisted" : "public",
        schedOn: false, canonical: p.canonical, previewImage: pi
      }
    });
    DRAFT.existed = false;   // not stored until something changes
    wmsg("Opened “" + p.title + "” for editing. Publishing replaces the online version and keeps its original date (" + RP.niceDate(p.date) + ").");
  }

  /* ═════════ routing ═════════ */
  function route() {
    var h = location.hash.replace(/^#\/?/, "") === "publish" ? "publish" : "write";
    if (h === "publish" && finished && !$("pub-result").children.length) h = "write";
    var changed = h !== view;
    view = h;
    $("view-write").hidden = h !== "write";
    $("view-publish").hidden = h !== "publish";
    hideBar(); hideInserter();
    if (h !== "write") { hideImgBar(false); if (openNoteId !== null) closeNote("cancel"); }
    if (h === "write") { fitAll(); count(); renderMarks(); updatePlus(); document.title = "Write a story — rumi-pulp"; }
    if (h === "publish") { persist(false); enterPublish(); document.title = "Publish — rumi-pulp"; }
    if (changed) {
      window.scrollTo(0, 0);
      var hd = $(h === "write" ? "write-h" : "publish-h"); if (hd) hd.focus({ preventScroll: true });
    }
  }
  window.addEventListener("hashchange", route);

  (async function init() {
    var did = params.get("draft"), slug = params.get("slug");
    if (did) {
      var rec = RPO.ID_RE.test(did) ? RPO.getDraft(did) : null;
      if (rec) loadRecord(rec);
      else { newStory(); wmsg(RPO.draftsBroken ? RPO.BROKEN_MSG : "That draft wasn't found, so this is a new story."); }
    } else if (slug && RPO.validSlug(slug)) {
      var ex = RPO.drafts().filter(function (d) { return d.editSlug === slug; })[0];
      if (ex) {
        loadRecord(ex);
        try { history.replaceState(null, "", "write.html?draft=" + encodeURIComponent(ex.id) + location.hash); } catch (e) {}
        wmsg("Opened your saved draft of this story. Publish it to replace the online version.");
      } else await openPublished(slug);
    } else newStory();
    ensureTrailing();
    count();
    loading = false;
    $("wr-saved").textContent = DRAFT.existed ? "Opened draft" : "Not saved yet";
    route();
    if (view === "write" && !$("wr-title").value && !body.querySelector("figure, p:not(:last-child)")) $("wr-title").focus({ preventScroll: true });
  })();
})();
