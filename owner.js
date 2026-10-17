/* rumi-pulp — owner tools shared by the stories and write pages:
   drafts, draft pictures, access to the rumi-pulp folder, and writing/removing the files of a post. */
(function () {
  "use strict";
  var RP = window.RP, store = RP.store;
  var RPO = (window.RPO = {});

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var NOT_REPO = "That folder doesn't look like rumi-pulp — pick the folder that has index.html and blog.html.";
  RPO.HAS_PICKER = typeof window.showDirectoryPicker === "function";
  RPO.NOT_REPO = NOT_REPO;
  RPO.ID_RE = /^d[a-z0-9]{3,30}$/;

  function PublishError(message, extra) {
    this.name = "PublishError"; this.message = message;
    if (extra) Object.keys(extra).forEach(function (k) { this[k] = extra[k]; }, this);
  }
  PublishError.prototype = Object.create(Error.prototype);
  RPO.PublishError = PublishError;

  function isObj(e) { return !!e && typeof e === "object" && !Array.isArray(e); }
  function validDate(s) { return typeof s === "string" && DATE_RE.test(s); }
  function validSlug(s) { return typeof s === "string" && RP.SLUG_RE.test(s) && s !== "index"; }
  function s(v) { return typeof v === "string" ? v : ""; }
  RPO.isObj = isObj; RPO.validDate = validDate; RPO.validSlug = validSlug;

  /* ── drafts (localStorage "rp:drafts") ── */
  var DKEY = "rp:drafts";
  RPO.newId = function () { return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  // When the saved drafts cannot be read, nothing may be written over them: they are copied to a backup key and saving is paused.
  RPO.draftsBroken = false;
  RPO.BROKEN_MSG = "Your saved drafts couldn't be read, so saving is paused to protect them. A backup copy was kept.";
  var BACKUP_RE = /^rp:drafts-backup-[0-9]+$/;
  function keepBackup(raw) {   // only the latest backup of unreadable drafts is kept
    var keys = [], i, k;
    try { for (i = 0; i < localStorage.length; i++) { k = localStorage.key(i); if (k && BACKUP_RE.test(k)) keys.push(k); } } catch (e) { return; }
    if (keys.some(function (x) { return store.get(x) === raw; })) return;
    var key = "rp:drafts-backup-" + Date.now();
    if (store.set(key, raw)) keys.forEach(function (x) { try { localStorage.removeItem(x); } catch (e) {} });
  }
  RPO.drafts = function () {
    var raw = store.get(DKEY), all = null;
    RPO.draftsBroken = false;
    if (raw === null || raw === "") return [];
    try { all = JSON.parse(raw); } catch (e) { all = null; }
    if (!Array.isArray(all)) { RPO.draftsBroken = true; keepBackup(raw); return []; }
    // Older drafts carry saved versions. That feature is gone, so they are dropped to free the browser's storage,
    // after the drafts as they were are copied once to "rp:drafts-backup-versions" (which is kept).
    if (all.some(function (d) { return isObj(d) && "versions" in d; })) {
      var bk = "rp:drafts-backup-versions";
      if (store.get(bk) !== null || store.set(bk, raw)) {
        all.forEach(function (d) { if (isObj(d)) delete d.versions; });
        store.set(DKEY, JSON.stringify(all));
      }
    }
    return all.filter(function (d) { return isObj(d) && typeof d.id === "string" && d.id; });
  };
  RPO.writeDrafts = function (list) { return RPO.draftsBroken ? false : store.set(DKEY, JSON.stringify(list)); };
  RPO.getDraft = function (id) { return RPO.drafts().filter(function (d) { return d.id === id; })[0] || null; };
  RPO.putDraft = function (rec) {
    var list = RPO.drafts(), i = list.findIndex(function (d) { return d.id === rec.id; });
    if (RPO.draftsBroken) return false;
    if (i >= 0) list[i] = rec; else list.unshift(rec);
    return RPO.writeDrafts(list);
  };
  RPO.removeDraft = function (id) { var list = RPO.drafts().filter(function (d) { return d.id !== id; }); return RPO.writeDrafts(list); };

  /* ── IndexedDB: db "rumi-pulp", stores "handles" (the remembered folder) and "images" (draft pictures) ── */
  function openDb() {
    return new Promise(function (resolve, reject) {
      var open = indexedDB.open("rumi-pulp", 2);
      open.onupgradeneeded = function () {
        var db = open.result;
        if (!db.objectStoreNames.contains("handles")) db.createObjectStore("handles");
        if (!db.objectStoreNames.contains("images")) db.createObjectStore("images");
      };
      open.onerror = function () { reject(open.error); };
      open.onblocked = function () { reject(new Error("The browser database is busy. Close other rumi-pulp tabs and try again.")); };
      open.onsuccess = function () { resolve(open.result); };
    });
  }
  function idb(storeName, mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(storeName, mode), req = fn(tx.objectStore(storeName));
          tx.oncomplete = function () { db.close(); resolve(req ? req.result : undefined); };
          tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
        } catch (e) { db.close(); reject(e); }
      });
    });
  }
  function getHandle() { return idb("handles", "readonly", function (st) { return st.get("repo"); }).catch(function () { return null; }); }
  function putHandle(h) { return idb("handles", "readwrite", function (st) { return st.put(h, "repo"); }).then(function () { return true; }, function () { return false; }); }
  function forgetHandle() { return idb("handles", "readwrite", function (st) { return st.delete("repo"); }).catch(function () {}); }

  function range(draftId) { return IDBKeyRange.bound(draftId + "/", draftId + "/￿"); }
  RPO.imgPut = function (draftId, name, blob) { return idb("images", "readwrite", function (st) { return st.put(blob, draftId + "/" + name); }); };
  RPO.imgGet = function (draftId, name) { return idb("images", "readonly", function (st) { return st.get(draftId + "/" + name); }).then(function (b) { return b || null; }, function () { return null; }); };
  RPO.imgDrop = function (draftId) { return idb("images", "readwrite", function (st) { return st.delete(range(draftId)); }).catch(function () {}); };

  /* ── the rumi-pulp folder ── */
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
  // Resolves to { dir, remembered }, or null when no folder is remembered yet and `pick` is false
  // (the caller then shows a "Choose folder" button whose click calls this again with pick: true).
  RPO.openRepo = async function (pick) {
    var handle = await getHandle(), fresh = false, remembered = true;
    if (!handle) {
      if (!pick) return null;
      handle = await window.showDirectoryPicker({ id: "rumi-pulp", mode: "readwrite" });
      fresh = true;
    } else if (!(await ensurePermission(handle))) {
      throw new PublishError("Your browser didn't get permission to use the rumi-pulp folder, so nothing was changed. Try again and choose Allow.");
    }
    if (!(await looksLikeRepo(handle))) {
      await forgetHandle();
      throw new PublishError(NOT_REPO);
    }
    if (fresh) remembered = await putHandle(handle);
    return { dir: handle, remembered: remembered };
  };

  async function writeData(dir, name, data) {
    var fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable();
    try { await w.write(data); await w.close(); }
    catch (e) { try { await w.abort(); } catch (_) {} throw e; }
  }
  async function readText(dir, name) {
    try { return await (await (await dir.getFileHandle(name)).getFile()).text(); }
    catch (e) { if (e && e.name === "NotFoundError") return null; throw e; }
  }
  async function removeIfExists(dir, name, recursive) {
    try { await dir.removeEntry(name, recursive ? { recursive: true } : undefined); }
    catch (e) { if (!(e && e.name === "NotFoundError")) throw e; }
  }
  async function subdir(dir, name, create) {
    try { return await dir.getDirectoryHandle(name, create ? { create: true } : undefined); }
    catch (e) { if (!create && e && e.name === "NotFoundError") return null; throw e; }
  }
  async function readIndex(postsDir) {
    var text = await readText(postsDir, "index.json");
    if (text == null || !text.trim()) return [];
    var data;
    try { data = JSON.parse(text); } catch (e) { throw new PublishError("posts/index.json isn't valid JSON, so nothing was changed. Fix or empty that file and try again."); }
    if (!Array.isArray(data)) throw new PublishError("posts/index.json should be a list, so nothing was changed. Fix that file and try again.");
    return data;
  }
  function indexText(list) { return JSON.stringify(list, null, 2) + "\n"; }
  // Entries we don't understand are kept exactly as they are; objects are sorted newest first.
  function sortedIndex(index, entry, removeSlug) {
    var slug = removeSlug || (entry && entry.slug);
    var rest = index.filter(function (e) { return !(isObj(e) && e.slug === slug); });
    var objs = RP.sortPosts(rest.filter(isObj).concat(entry ? [entry] : []));
    return objs.concat(rest.filter(function (e) { return !isObj(e); }));
  }
  RPO.readPostFiles = async function (dir, slug) {
    var posts = await subdir(dir, "posts", false);
    if (!posts) throw new PublishError("The posts folder wasn't found.");
    var md = await readText(posts, slug + ".md");
    if (md == null) throw new PublishError("The file posts/" + slug + ".md wasn't found.");
    var images = [], root = await subdir(posts, "images", false), sd = root && await subdir(root, slug, false);
    if (sd) {
      for await (var name of sd.keys()) {
        try { images.push({ name: name, blob: await (await sd.getFileHandle(name)).getFile() }); } catch (e) { /* not a file */ }
      }
    }
    return { md: md, images: images };
  };

  /* ── share page and feed ── */
  RPO.postUrl = function (slug) { return RP.SITE + "post.html?slug=" + slug; };
  RPO.shareUrl = function (slug) { return RP.SITE + "posts/" + slug + ".html"; };
  function absImage(img) {
    if (/^https:\/\//.test(img)) return img;
    return RP.IMG_REL.test(img) ? RP.SITE + "posts/" + img : "";
  }
  RPO.sharePage = function (e) {
    var x = RP.esc, slug = e.slug;
    var title = s(e.displayTitle).trim() || s(e.title), desc = s(e.displaySubtitle).trim() || s(e.subtitle).trim() || s(e.summary);
    var canon = /^https:\/\/[^\s]+$/.test(s(e.canonical)) ? e.canonical : RPO.postUrl(slug);
    var img = absImage(s(e.image)), rel = "../post.html?slug=" + slug;
    var l = [
      "<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      "<title>" + x(title) + " — rumi-pulp</title>",
      '<meta name="description" content="' + x(desc) + '">',
      '<link rel="canonical" href="' + x(canon) + '">'
    ];
    if (e.visibility === "unlisted") l.push('<meta name="robots" content="noindex">');
    l.push(
      '<meta property="og:type" content="article">', '<meta property="og:site_name" content="rumi-pulp">',
      '<meta property="og:title" content="' + x(title) + '">', '<meta property="og:description" content="' + x(desc) + '">',
      '<meta property="og:url" content="' + x(canon) + '">'
    );
    if (img) l.push('<meta property="og:image" content="' + x(img) + '">');
    l.push(
      '<meta name="twitter:card" content="' + (img ? "summary_large_image" : "summary") + '">',
      '<meta name="twitter:title" content="' + x(title) + '">', '<meta name="twitter:description" content="' + x(desc) + '">'
    );
    if (img) l.push('<meta name="twitter:image" content="' + x(img) + '">');
    l.push(
      '<meta http-equiv="refresh" content="0; url=' + x(rel) + '">', "</head>", "<body>",
      '<p><a href="' + x(rel) + '">Read “' + x(s(e.title)) + '” on rumi-pulp</a></p>', "</body>", "</html>", ""
    );
    return l.join("\n");
  };
  function xml(t) {
    return String(t).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  RPO.buildFeed = function (index, now) {
    var items = index.filter(function (e) {
      return isObj(e) && validSlug(e.slug) && s(e.title).trim() && validDate(e.date) && RP.isLive(e, now);
    });
    items = RP.sortPosts(items).slice(0, 20);
    function pub(e) { return new Date(e.publishAt && !isNaN(Date.parse(e.publishAt)) ? e.publishAt : e.date + "T00:00:00+08:00").toUTCString(); }
    var l = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">', "<channel>",
      "<title>rumi-pulp</title>", "<link>" + RP.SITE + "</link>",
      "<description>Writing by Rumi, a creative writer based in Kuala Lumpur.</description>",
      "<language>en</language>",
      '<atom:link href="' + RP.SITE + 'feed.xml" rel="self" type="application/rss+xml"/>'
    ];
    if (items.length) l.push("<lastBuildDate>" + pub(items[0]) + "</lastBuildDate>");
    items.forEach(function (e) {
      var link = RPO.postUrl(e.slug), d = s(e.subtitle).trim() || s(e.summary);
      l.push("<item>", "<title>" + xml(e.title) + "</title>", "<link>" + xml(link) + "</link>",
        '<guid isPermaLink="true">' + xml(link) + "</guid>", "<pubDate>" + pub(e) + "</pubDate>");
      if (d) l.push("<description>" + xml(d) + "</description>");
      (Array.isArray(e.tags) ? e.tags : []).forEach(function (t) { if (typeof t === "string" && t.trim()) l.push("<category>" + xml(t.trim()) + "</category>"); });
      l.push("</item>");
    });
    l.push("</channel>", "</rss>", "");
    return l.join("\n");
  };

  /* ── publishing ── */
  function newPostId() {
    try { if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID(); } catch (e) { /* fall through */ }
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
  RPO.newPostId = newPostId;

  /* post: { title, subtitle, summary, words, tags, dropCap, visibility, publishAt, canonical, displayTitle, displaySubtitle,
             preview: null | {name} | {remote}, images: [{name, blob}], buildMd(slug) → markdown }
     opts: { editSlug, editId, editDate }        editing a published post: it must still have this slug AND this permanent id,
                                                  otherwise (someone else's post now has the address) this is published as a new post
           { partialSlug, partialId, partialDate } finishing an earlier attempt whose leftover files could not be cleaned up
     Writes, in order: pictures, the .md file, the share page, posts/index.json, feed.xml.
     A failed first publish removes what it wrote (best effort). The error then has cleaned: true.
     If that cleanup fails, or a failed edit leaves a half-updated post, the error has partial: true plus slug, id and date
     (and editing: true for an edit), so a retry can finish the job. */
  RPO.publish = async function (dir, post, opts) {
    opts = opts || {};
    var postsDir = await subdir(dir, "posts", true);
    var origIndexText = await readText(postsDir, "index.json");
    var index = await readIndex(postsDir);
    var origFeed = await readText(dir, "feed.xml");
    function same(e, sl) { return isObj(e) && e.slug === sl; }

    var slug = null, existing = null, id = "", detached = false, editing = false, resumed = false;
    if (validSlug(opts.editSlug)) {
      var cur = index.filter(function (e) { return same(e, opts.editSlug); })[0] || null;
      if (cur && s(cur.id) === s(opts.editId)) { slug = opts.editSlug; existing = cur; editing = true; id = s(cur.id) || newPostId(); }
      else detached = true;    // the address is gone or belongs to a different post now
    }
    if (!slug && validSlug(opts.partialSlug)) {
      var pc = index.filter(function (e) { return same(e, opts.partialSlug); })[0] || null;
      if (!pc || (s(pc.id) && pc.id === opts.partialId)) { slug = opts.partialSlug; existing = pc; id = s(opts.partialId) || newPostId(); resumed = true; }
    }
    if (!slug) {
      var base = RP.slugify(post.title);
      if (!base) throw new PublishError("Use letters or numbers in the title so the story has a web address.");
      slug = base;
      var n = 2;
      while (slug === "index" || index.some(function (e) { return same(e, slug); }) || (await hasFile(postsDir, slug + ".md"))) slug = base + "-" + n++;
      id = newPostId();
    }
    var when = post.publishAt || "";
    var date = existing && validDate(existing.date) ? existing.date
      : editing && validDate(opts.editDate) ? opts.editDate
      : resumed && validDate(opts.partialDate) ? opts.partialDate
      : (when ? RP.klDateOf(when) : RP.todayKL());
    var entry = Object.assign({}, existing || {}, {
      slug: slug, id: id, title: post.title, date: date, updated: RP.todayKL(), visibility: post.visibility,
      tags: post.tags, summary: post.summary, words: post.words, dropCap: !!post.dropCap
    });
    function setOrDrop(k, v) { if (v) entry[k] = v; else delete entry[k]; }
    setOrDrop("subtitle", post.subtitle); setOrDrop("displayTitle", post.displayTitle); setOrDrop("displaySubtitle", post.displaySubtitle);
    setOrDrop("publishAt", when); setOrDrop("canonical", post.canonical);
    setOrDrop("image", post.preview ? (post.preview.name ? "images/" + slug + "/" + post.preview.name : post.preview.remote) : "");

    var wrote = false, indexWritten = false, feedWritten = false, keep = {};
    // Undo a failed first publish: put the list and feed back as they were and delete this story's files. Resolves to false if anything could not be undone.
    async function rollback() {
      var ok = true;
      async function step(fn) { try { await fn(); } catch (x) { ok = false; } }
      if (feedWritten) await step(async function () { if (origFeed != null) await writeData(dir, "feed.xml", origFeed); else await removeIfExists(dir, "feed.xml"); });
      if (indexWritten) await step(async function () { if (origIndexText != null) await writeData(postsDir, "index.json", origIndexText); else await removeIfExists(postsDir, "index.json"); });
      await step(function () { return removeIfExists(postsDir, slug + ".md"); });
      await step(function () { return removeIfExists(postsDir, slug + ".html"); });
      await step(async function () { var root = await subdir(postsDir, "images", false); if (root) await removeIfExists(root, slug, true); });
      return ok;
    }
    try {
      var names = {};
      post.images.forEach(function (im) { names[im.name] = im; });
      var imgDir = null;
      for (var name in names) {
        wrote = true;
        if (!imgDir) imgDir = await subdir(await subdir(postsDir, "images", true), slug, true);
        await writeData(imgDir, name, names[name].blob);
        keep[name] = true;
      }
      wrote = true;
      await writeData(postsDir, slug + ".md", post.buildMd(slug));
      await writeData(postsDir, slug + ".html", RPO.sharePage(entry));
      var newIndex = sortedIndex(index, entry);
      indexWritten = true;
      await writeData(postsDir, "index.json", indexText(newIndex));
      feedWritten = true;
      await writeData(dir, "feed.xml", RPO.buildFeed(newIndex, new Date()));
    } catch (e) {
      if (wrote && e && typeof e === "object") {
        // for an edit that failed before the list was rewritten, the id to send back is the one the list still has
        e.slug = slug; e.date = date; e.id = editing && !indexWritten ? s(existing.id) : id; e.editing = editing;
        if (editing) e.partial = true;      // the post is half updated: a retry finishes it
        else { var clean = await rollback(); e.partial = !clean; e.cleaned = clean; }
      }
      throw e;
    }
    // pictures that are no longer in the story (best effort; the post itself is already published)
    try {
      var root = await subdir(postsDir, "images", false), sd = root && await subdir(root, slug, false);
      if (sd) {
        var stale = [];
        for await (var nm of sd.keys()) if (!keep[nm]) stale.push(nm);
        for (var i = 0; i < stale.length; i++) await removeIfExists(sd, stale[i]);
        if (!Object.keys(keep).length) await removeIfExists(root, slug, true);
      }
    } catch (e) { /* leftover pictures are harmless */ }
    return { slug: slug, id: id, entry: entry, detached: detached };
  };

  // Change one entry of posts/index.json (visibility, go-live time...) and refresh its share page and the feed.
  // expectedId (optional): the permanent id the caller saw; a different id means the address now belongs to another post.
  RPO.updateEntry = async function (dir, slug, patch, expectedId) {
    var postsDir = await subdir(dir, "posts", false);
    if (!postsDir) throw new PublishError("The posts folder wasn't found in that folder.");
    var index = await readIndex(postsDir);
    var cur = index.filter(function (e) { return isObj(e) && e.slug === slug; })[0];
    if (!cur) throw new PublishError("That story isn't in posts/index.json, so nothing was changed.");
    if (expectedId !== undefined && s(cur.id) !== s(expectedId)) throw new PublishError("That address now belongs to a different story, so nothing was changed. Reload this page.");
    var entry = Object.assign({}, cur, patch);
    Object.keys(patch).forEach(function (k) { if (patch[k] === null) delete entry[k]; });
    entry.updated = RP.todayKL();
    var newIndex = sortedIndex(index, entry);
    await writeData(postsDir, slug + ".html", RPO.sharePage(entry));
    await writeData(postsDir, "index.json", indexText(newIndex));
    await writeData(dir, "feed.xml", RPO.buildFeed(newIndex, new Date()));
    return entry;
  };

  // Remove a story from the site: first the list and the feed, then its files.
  // opts.id: the permanent id the caller believes the story has; if the list says otherwise the address now belongs to another post and nothing is touched.
  RPO.removePost = async function (dir, slug, opts) {
    var postsDir = await subdir(dir, "posts", false);
    if (!postsDir) return;
    var index = await readIndex(postsDir);
    var cur = index.filter(function (e) { return isObj(e) && e.slug === slug; })[0] || null;
    if (cur && opts && opts.id !== undefined && s(cur.id) !== s(opts.id)) {
      throw new PublishError("That address now belongs to a different story, so nothing was removed.");
    }
    if (cur) {
      var newIndex = sortedIndex(index, null, slug);
      await writeData(postsDir, "index.json", indexText(newIndex));
      await writeData(dir, "feed.xml", RPO.buildFeed(newIndex, new Date()));
    }
    await removeIfExists(postsDir, slug + ".md");
    await removeIfExists(postsDir, slug + ".html");
    var root = await subdir(postsDir, "images", false);
    if (root) await removeIfExists(root, slug, true);
  };

  // Rebuild feed.xml from posts/index.json (for a scheduled story that has gone live since the feed was last written).
  RPO.rebuildFeed = async function (dir) {
    var postsDir = await subdir(dir, "posts", false);
    var index = postsDir ? await readIndex(postsDir) : [];
    await writeData(dir, "feed.xml", RPO.buildFeed(index, new Date()));
  };

  RPO.explain = function (e) {
    if (e && e.name === "AbortError") return "Cancelled.";
    if (e instanceof PublishError) return e.message;
    if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
      return "Your browser didn't allow access to that folder, so nothing was changed. Try again and choose Allow when it asks.";
    }
    return "Something went wrong: " + (e && e.message ? e.message : "unknown error") + ".";
  };
})();
