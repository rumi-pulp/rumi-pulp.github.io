/* rumi-pulp — writing desk (owner only) */
(function () {
  "use strict";
  var RP = window.RP, $ = RP.$, el = RP.el, store = RP.store;

  if (!RP.isOwner) {
    if (location.protocol === "file:") $("gate-msg").textContent = "Run node serve.js and open http://localhost:4321/write.html";
    $("gate").hidden = false;
    return;
  }
  $("editor").hidden = false;

  var DKEY = "rp:drafts";
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var NOT_REPO = "That folder doesn't look like rumi-pulp — pick the folder that has index.html and blog.html.";
  var HAS_PICKER = typeof window.showDirectoryPicker === "function";

  var editing = null;      // id of the draft currently in the editor
  var editSlug = null;     // slug of the published post being edited, if any
  var editDate = null;     // that post's original date, if known
  var partial = false;     // a publish wrote the post file but not posts/index.json
  var published = [];      // posts from the manifest
  var dirty = false, saveTimer = null, publishing = false, introBtn = null, openToken = 0;

  function PublishError(message) { this.name = "PublishError"; this.message = message; }
  PublishError.prototype = Object.create(Error.prototype);

  function validSlug(s) { return typeof s === "string" && RP.SLUG_RE.test(s) && s !== "index"; }
  function validDate(s) { return typeof s === "string" && DATE_RE.test(s); }
  function isObj(e) { return !!e && typeof e === "object" && !Array.isArray(e); }
  function draftTitle(d) { return String(d.title || "") || "Untitled"; }

  /* ── drafts storage ── */
  function drafts() {
    try {
      var l = JSON.parse(store.get(DKEY) || "[]");
      return Array.isArray(l) ? l.filter(function (d) { return isObj(d) && d.id; }) : [];
    } catch (e) { return []; }
  }
  function writeDrafts(list) { return store.set(DKEY, JSON.stringify(list)); }

  /* ── editor state ── */
  function knownDate() {
    if (editDate) return editDate;
    var p = published.filter(function (x) { return x.slug === editSlug; })[0];
    return p ? p.date : null;
  }
  function renderMode() {
    $("write-h").textContent = editSlug ? "Edit post" : "New post";
    var note = $("ed-mode"), text = "";
    if (partial) {
      text = "Post file saved but the list wasn't updated — press Publish again to finish.";
    } else if (editSlug) {
      var d = knownDate();
      text = "Editing “" + editSlug + "”. " + (d
        ? "Publishing replaces it and keeps its original date (" + RP.niceDate(d) + ")."
        : "Its original date isn't known here, so today's date will be used if the post list doesn't have one.");
    }
    note.hidden = !text;
    note.textContent = text;
  }
  function refreshEditor() {
    var title = $("ed-title").value, body = $("ed-text").value, words = RP.countWords(body);
    $("ed-count").textContent = words ? words + " words · " + RP.readTime(words) + " min read" : "0 words";
    $("pv-title").textContent = title || "Title";
    $("pv-title").className = title ? "" : "placeholder";
    if (body.trim()) { $("pv-body").innerHTML = RP.md(body); }
    else { $("pv-body").innerHTML = '<p class="placeholder">Your post will appear here as you type.</p>'; }
  }
  function say(msg, ok, link) {
    var m = $("ed-msg");
    m.textContent = "";
    var d = el("div", ok ? "ok" : null, msg);
    if (link) {
      var a = el("a", null, link.text);
      a.href = link.href;
      d.appendChild(document.createTextNode(" "));
      d.appendChild(a);
    }
    m.appendChild(d);
  }
  function fillEditor(rec) {
    $("ed-title").value = rec.title || "";
    $("ed-tags").value = rec.tags || "";
    $("ed-summary").value = rec.summary || "";
    $("ed-text").value = rec.body || "";
    editSlug = validSlug(rec.editSlug) ? rec.editSlug : null;   // a bad value from storage means "new post"
    editDate = editSlug && validDate(rec.editDate) ? rec.editDate : null;
    partial = !!(editSlug && rec.partial);
    renderMode();
    refreshEditor();
  }
  function clearEditor() {
    clearTimeout(saveTimer);
    editing = null; dirty = false;
    fillEditor({});
    $("ed-saved").textContent = "Not saved yet";
  }

  ["ed-title", "ed-text", "ed-tags", "ed-summary"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      dirty = true;
      $("ed-saved").textContent = "Unsaved changes";
      refreshEditor();
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { saveDraft(false); }, 1200);
    });
  });

  function saveDraft(loud) {
    clearTimeout(saveTimer);
    var title = $("ed-title").value.trim(), body = $("ed-text").value;
    if (!title && !body.trim()) {
      dirty = false;   // nothing worth keeping
      if (loud) say("Nothing to save yet — write something first.");
      return;
    }
    var list = drafts(), id = editing || ("d" + Date.now());
    var rec = {
      id: id, title: title, tags: $("ed-tags").value, summary: $("ed-summary").value, body: body,
      editSlug: editSlug, editDate: editDate, partial: partial, saved: new Date().toISOString()
    };
    var i = list.findIndex(function (d) { return d.id === id; });
    if (i >= 0) list[i] = rec; else list.unshift(rec);
    editing = id;
    var ok = writeDrafts(list);
    dirty = !ok;
    $("ed-saved").textContent = ok
      ? "Draft saved at " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "Couldn't save — copy your text somewhere safe";
    if (loud) say(ok ? "Draft saved." : "Couldn't save: this browser is blocking storage.");
    drawDrafts();
  }

  // Before replacing what's in the editor: save it, and ask if that wasn't possible or a half-finished publish is pending.
  function okToLeave(skipPartial) {
    clearTimeout(saveTimer);
    if (dirty) saveDraft(false);
    if (dirty && !confirm("Your current text couldn't be saved as a draft. Replace it anyway?")) return false;
    if (partial && !skipPartial &&!confirm("Your last publish saved the post file but didn't update the list. Open another post anyway? (This draft stays in your drafts; press Publish on it later to finish.)")) return false;
    return true;
  }

  function newPost() {
    if (!okToLeave()) return;
    clearEditor();
    $("ed-msg").textContent = "";
    $("ed-title").focus();
  }
  function openDraft(d, alreadyChecked) {
    if (!alreadyChecked && !okToLeave()) return;
    var fresh = drafts().filter(function (x) { return x.id === d.id; })[0] || d; // re-read: the list on screen may be stale
    editing = fresh.id; dirty = false;
    fillEditor(fresh);
    $("ed-saved").textContent = "Opened draft";
    $("ed-msg").textContent = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
    $("ed-text").focus({ preventScroll: true });
  }

  function drawDrafts() {
    var box = $("draft-list"), list = drafts();
    box.textContent = "";
    if (!list.length) {
      box.appendChild(el("p", "dim", "No drafts yet. Anything you write saves here automatically (in this browser)."));
      return;
    }
    list.forEach(function (d) {
      var title = draftTitle(d);
      var row = el("div", "draft-row");
      var b = el("button", "t", title);
      b.type = "button";
      b.addEventListener("click", function () { openDraft(d); });
      var when = "";
      if (d.saved) {
        var dt = new Date(d.saved);
        if (!isNaN(dt)) when = dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      }
      var label = (d.editSlug && validSlug(d.editSlug) ? "editing " + d.editSlug + (when ? " · " : "") : "") + when;
      var meta = el("span", "dim", label);
      var del = el("button", "del", "Delete");
      del.type = "button";
      del.setAttribute("aria-label", "Delete draft " + title);
      del.addEventListener("click", function () {
        if (!confirm("Delete the draft \"" + title + "\"? This can't be undone.")) return;
        clearTimeout(saveTimer);
        if (dirty && editing !== d.id) saveDraft(false);
        writeDrafts(drafts().filter(function (x) { return x.id !== d.id; }));
        if (editing === d.id) clearEditor();
        drawDrafts();
      });
      row.appendChild(b); row.appendChild(meta); row.appendChild(del);
      box.appendChild(row);
    });
  }

  /* ── published posts (edit) ── */
  function drawPublished(failed) {
    var box = $("published-list");
    box.textContent = "";
    if (failed) { box.appendChild(el("p", "dim", "Couldn't read the list of published posts.")); return; }
    if (!published.length) { box.appendChild(el("p", "dim", "Nothing published yet.")); return; }
    published.forEach(function (p) {
      var row = el("div", "draft-row");
      var b = el("button", "t", p.title);
      b.type = "button";
      b.addEventListener("click", function () { openPublished(p); });
      row.appendChild(b);
      row.appendChild(el("span", "dim", RP.niceDate(p.date)));
      box.appendChild(row);
    });
  }
  function loadPublished() {
    RP.loadPosts().then(function (list) { published = list; drawPublished(false); renderMode(); },
      function () { drawPublished(true); });
  }
  function openPublished(p) {
    if (!okToLeave()) return;
    var token = ++openToken;
    var existing = drafts().filter(function (d) { return d.editSlug === p.slug; })[0];
    if (existing) {
      openDraft(existing, true);
      say("Opened your saved draft of this post. Publish it to replace the online version.");
      return;
    }
    say("Opening “" + p.title + "”…");
    fetch("posts/" + encodeURIComponent(p.slug) + ".md", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("the post file returned " + r.status);
      return r.text();
    }).then(function (text) {
      if (token !== openToken) return;
      if (!okToLeave(true)) { $("ed-msg").textContent = ""; return; }   // typed something while it loaded
      editing = null; dirty = false;
      fillEditor({ title: p.title, tags: p.tags.join(", "), summary: p.summary, body: text.replace(/\s+$/, ""), editSlug: p.slug, editDate: p.date });
      $("ed-saved").textContent = "Opened for editing";
      $("ed-msg").textContent = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
      $("ed-text").focus({ preventScroll: true });
    }).catch(function (e) {
      if (token === openToken) say("Couldn't open that post: " + (e && e.message ? e.message : "unknown error") + ".");
    });
  }

  /* ── publishing helpers ── */
  function parseTags(s) {
    var out = [];
    s.split(",").forEach(function (t) { t = t.trim().toLowerCase(); if (t && out.indexOf(t) < 0) out.push(t); });
    return out;
  }
  function autoSummary(body) {
    var blocks = body.replace(/\r/g, "").split(/\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    var block = blocks.filter(function (b) { return !/^#{1,3}\s/.test(b); })[0] || blocks[0] || "";
    var t = block.replace(/^#{1,3}\s+/gm, "").replace(/^>\s?/gm, "")
      .replace(/\[([^\]]+)\]\([^)\s]*\)/g, "$1").replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")
      .replace(/\s+/g, " ").trim();
    if (t.length <= 140) return t;
    var cut = t.slice(0, 139), sp = cut.lastIndexOf(" ");
    if (t.charAt(139) !== " " && sp > 0) cut = cut.slice(0, sp);
    return cut.replace(/[\s,;:.\-–—]+$/, "") + "…";
  }
  // Works out the slug and the new posts/index.json for this post. `fileExists(name)` is async.
  // Entries we don't understand are kept exactly as they are; only the entry with this slug is replaced.
  async function plan(index, post, fileExists) {
    var slug, existing = null;
    function same(e, s) { return isObj(e) && e.slug === s; }
    if (editSlug) {
      slug = editSlug;
      existing = index.filter(function (e) { return same(e, slug); })[0] || null;
    } else {
      var base = RP.slugify(post.title);
      if (!base) throw new PublishError("Use letters or numbers in the title so the post has a web address.");
      slug = base;
      var n = 2;
      while (slug === "index" || index.some(function (e) { return same(e, slug); }) || await fileExists(slug + ".md")) slug = base + "-" + n++;
    }
    var date = existing && validDate(existing.date) ? existing.date : (knownDate() || RP.todayKL());
    var entry = Object.assign({}, existing || {}, {
      slug: slug, title: post.title, date: date, tags: post.tags, summary: post.summary, words: post.words
    });
    var rest = index.filter(function (e) { return !same(e, slug); });
    var objs = RP.sortPosts(rest.filter(isObj).concat([entry]));
    var others = rest.filter(function (e) { return !isObj(e); });
    return { slug: slug, entry: entry, mdText: post.mdText, indexText: JSON.stringify(objs.concat(others), null, 2) + "\n" };
  }

  /* remembered folder: IndexedDB db "rumi-pulp", store "handles", key "repo" */
  function idbRun(mode, fn) {
    return new Promise(function (resolve, reject) {
      var open = indexedDB.open("rumi-pulp", 1);
      open.onupgradeneeded = function () { open.result.createObjectStore("handles"); };
      open.onerror = function () { reject(open.error); };
      open.onsuccess = function () {
        var db = open.result, req;
        try {
          var tx = db.transaction("handles", mode);
          req = fn(tx.objectStore("handles"));
          tx.oncomplete = function () { db.close(); resolve(req.result); };
          tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
        } catch (e) { db.close(); reject(e); }
      };
    });
  }
  function getHandle() { return idbRun("readonly", function (s) { return s.get("repo"); }).catch(function () { return null; }); }
  function putHandle(h) { return idbRun("readwrite", function (s) { return s.put(h, "repo"); }).then(function () { return true; }, function () { return false; }); }
  function forgetHandle() { return idbRun("readwrite", function (s) { return s.delete("repo"); }).catch(function () {}); }

  async function ensurePermission(h) {
    var opts = { mode: "readwrite" };
    if ((await h.queryPermission(opts)) === "granted") return true;
    return (await h.requestPermission(opts)) === "granted";
  }
  async function hasFile(dir, name) {
    try { await dir.getFileHandle(name); return true; }
    catch (e) { if (e && (e.name === "NotFoundError" || e.name === "TypeMismatchError")) return false; throw e; }
  }
  async function looksLikeRepo(dir) {
    return (await hasFile(dir, "index.html")) && (await hasFile(dir, "blog.html"));
  }
  async function writeText(dir, name, text) {
    var fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable();
    try { await w.write(text); await w.close(); }
    catch (e) { try { await w.abort(); } catch (_) {} throw e; }
  }
  async function readIndex(postsDir) {
    var fh;
    try { fh = await postsDir.getFileHandle("index.json"); }
    catch (e) { if (e && e.name === "NotFoundError") return []; throw e; }
    var text = await (await fh.getFile()).text();
    if (!text.trim()) return [];
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new PublishError("posts/index.json isn't valid JSON, so nothing was changed. Fix or empty that file and try again."); }
    if (!Array.isArray(data)) throw new PublishError("posts/index.json should be a list, so nothing was changed. Fix that file and try again.");
    return data;
  }
  function download(name, text, type) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = document.createElement("a");
    a.href = url; a.download = name; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function showIntro() {
    var m = $("ed-msg");
    m.textContent = "";
    m.appendChild(el("div", null, "Choose your rumi-pulp folder (the one that contains index.html). You only need to do this once; your browser will remember it."));
    var b = el("button", "btn primary", "Choose folder");
    b.type = "button";
    b.addEventListener("click", function () { publish(true); });
    m.appendChild(b);
    introBtn = b;
  }

  function finishPublished(draftId, entry, rememberFailed) {
    clearTimeout(saveTimer);
    if (draftId) writeDrafts(drafts().filter(function (d) { return d.id !== draftId; }));
    if (editing === draftId) clearEditor();   // only if that draft is still what's on screen
    drawDrafts();
    say("Published “" + entry.title + "”. It's saved in your rumi-pulp folder. To put it online, commit and push (GitHub Desktop: Commit to main → Push origin)."
      + (rememberFailed ? " Couldn't remember the folder; you'll be asked again next time." : ""),
      true, { text: "View it", href: "post.html?slug=" + encodeURIComponent(entry.slug) });
    loadPublished();
  }

  async function publishToFolder(post, draftId, skipIntro) {
    var handle = await getHandle(), fresh = false, remembered = true;
    if (!handle) {
      if (!skipIntro) { showIntro(); return; }
      handle = await window.showDirectoryPicker({ id: "rumi-pulp", mode: "readwrite" });
      fresh = true;
    } else if (!(await ensurePermission(handle))) {
      throw new PublishError("Your browser didn't get permission to save in the rumi-pulp folder, so nothing was published. Press Publish again and choose Allow.");
    }
    if (!(await looksLikeRepo(handle))) {
      await forgetHandle();
      throw new PublishError(NOT_REPO);
    }
    if (fresh) remembered = await putHandle(handle);

    var postsDir = await handle.getDirectoryHandle("posts", { create: true });
    var index = await readIndex(postsDir);
    var p = await plan(index, post, function (name) { return hasFile(postsDir, name); });
    await writeText(postsDir, p.slug + ".md", p.mdText);
    try {
      await writeText(postsDir, "index.json", p.indexText);
    } catch (e) {
      // The post file is already on disk. Remember that in the draft so a retry finishes the job (same slug, same date).
      editSlug = p.slug; editDate = p.entry.date; partial = true;
      renderMode(); saveDraft(false);
      throw new PublishError("Post file saved but the list wasn't updated — press Publish again to finish. (" + (e && e.message ? e.message : "unknown error") + ")");
    }
    finishPublished(draftId, p.entry, !remembered);
  }

  async function publishFallback(post) {
    var index;
    try { index = await RP.fetchManifest(); }
    catch (e) {
      if (e && e.status === 404) index = [];
      else throw new PublishError("Couldn't read the current list of posts (posts/index.json), so nothing was downloaded. Check your connection and try again.");
    }
    var p = await plan(index, post, function () { return Promise.resolve(false); });
    download(p.slug + ".md", p.mdText, "text/markdown");
    await sleep(400);
    download("index.json", p.indexText, "application/json");
    // The draft and the editor stay as they are: the files are only downloads until they're moved into posts/.
    say("Your browser can't save into folders. Two files were downloaded — move them into the posts folder, replacing index.json. Your draft stays here until you delete it.", true);
  }

  function explain(e) {
    if (e && e.name === "AbortError") return "Publishing cancelled.";
    if (e instanceof PublishError) return e.message;
    if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
      return "Your browser didn't allow saving to that folder, so nothing was published. Press Publish again and choose Allow when it asks.";
    }
    return "Couldn't publish: " + (e && e.message ? e.message : "something went wrong") + ". Your draft is still here.";
  }
  function setBusy(busy) {
    var b = $("k-publish");
    b.disabled = busy;
    b.textContent = busy ? "Publishing…" : "Publish";
    $("editor").inert = busy;   // editor, drafts and published lists all lock while publishing
  }

  function publish(skipIntro) {
    if (publishing) return;
    var title = $("ed-title").value.trim(), body = $("ed-text").value.replace(/\r\n?/g, "\n").trim();
    if (!title) { say("Add a title before publishing."); $("ed-title").focus(); return; }
    if (!body) { say("The post is empty — write something before publishing."); $("ed-text").focus(); return; }
    saveDraft(false);
    var draftId = editing;
    var post = {
      title: title, tags: parseTags($("ed-tags").value),
      summary: $("ed-summary").value.trim() || autoSummary(body),
      words: RP.countWords(body), mdText: body + "\n"
    };
    publishing = true; introBtn = null;
    setBusy(true);
    var job = HAS_PICKER ? publishToFolder(post, draftId, skipIntro === true) : publishFallback(post);
    job.catch(function (e) { say(explain(e)); }).then(function () {
      publishing = false;
      setBusy(false);
      if (introBtn) { introBtn.focus(); introBtn = null; }
    });
  }

  /* ── wiring ── */
  $("k-save").addEventListener("click", function () { saveDraft(true); });
  $("k-publish").addEventListener("click", function () { publish(false); });
  $("k-new").addEventListener("click", newPost);
  $("k-preview").addEventListener("click", function () {
    var ed = $("ed"), toPv = ed.dataset.mode === "edit";
    ed.dataset.mode = toPv ? "preview" : "edit";
    this.textContent = toPv ? "Edit" : "Preview";
  });
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === "s") { e.preventDefault(); if (!publishing) saveDraft(true); }
  });
  window.addEventListener("pagehide", function () { if (dirty && !publishing) saveDraft(false); });

  renderMode();
  refreshEditor();
  drawDrafts();
  loadPublished();
})();
