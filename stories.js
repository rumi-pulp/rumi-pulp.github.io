/* rumi-pulp — your stories (owner only): drafts, published, unlisted and scheduled */
(function () {
  "use strict";
  var RP = window.RP, RPO = window.RPO, $ = RP.$, el = RP.el;

  if (!RP.isOwner) {
    if (location.protocol === "file:") $("gate-msg").textContent = "Run node serve.js and open http://localhost:4321/stories.html";
    $("gate").hidden = false;
    return;
  }
  $("stories").hidden = false;

  var TABS = [["draft", "Drafts"], ["published", "Published"], ["unlisted", "Unlisted"], ["scheduled", "Scheduled"]];
  var activeTab = "draft", openMenu = null, POSTS = [], postsFailed = false, busy = false, scheduling = null;
  var NEEDS_CHROME = "Changing published stories needs Chrome or Edge on your computer, because it saves into your rumi-pulp folder.";

  function num(n) { return Number(n).toLocaleString("en-US"); }
  function say(msg) { $("st-msg").textContent = msg; }
  function sayLink(msg, href, text) {
    var m = $("st-msg");
    m.textContent = msg + " ";
    var a = el("a", null, text); a.href = href; m.appendChild(a);
  }

  /* ── data ── */
  function parseTagString(s) {
    var out = [];
    String(s || "").split(",").forEach(function (t) { t = t.trim().toLowerCase(); if (t && out.indexOf(t) < 0) out.push(t); });
    return out;
  }
  // Drafts written by the old markdown editor keep their text in `body` and their topics in a comma-separated string.
  function draftInfo(d) {
    var st = RPO.isObj(d.settings) ? d.settings : {};
    var tags = Array.isArray(st.tags) ? st.tags : parseTagString(d.tags);
    var words = Number(d.words) > 0 ? Number(d.words) : (typeof d.body === "string" ? RP.countWords(d.body) : 0);
    var when = d.saved ? new Date(d.saved) : null;
    return {
      id: d.id, kind: "draft", title: String(d.title || "").trim() || "Untitled draft", subtitle: String(d.subtitle || "").trim(),
      words: words, tags: tags, date: when && !isNaN(when) ? RP.klNow(when).date : "", editSlug: RPO.validSlug(d.editSlug) ? d.editSlug : "",
      saved: when && !isNaN(when) ? when.getTime() : 0,
      // files of a failed first publish that could not be removed again
      unfinished: RPO.validSlug(d.partialSlug) ? d.partialSlug : "", partialId: typeof d.partialId === "string" ? d.partialId : undefined
    };
  }
  function groups() {
    var now = Date.now(), g = { draft: [], published: [], unlisted: [], scheduled: [] };
    RPO.drafts().map(draftInfo).sort(function (a, b) { return b.saved - a.saved; }).forEach(function (d) { g.draft.push(d); });
    POSTS.forEach(function (p) {
      var row = Object.assign({ kind: "post" }, p);
      if (RP.isScheduled(p, now)) g.scheduled.push(row);
      else if (p.visibility === "unlisted") g.unlisted.push(row);
      else if (p.visibility === "public") g.published.push(row);
    });
    g.scheduled.sort(function (a, b) { return Date.parse(a.publishAt) - Date.parse(b.publishAt); });
    return g;
  }
  function reload() {
    return RP.loadPosts().then(function (list) { POSTS = list; postsFailed = false; },
      function (e) { POSTS = []; postsFailed = !(e && e.status === 404); });   // a missing index just means nothing is published yet
  }

  /* ── stats ── */
  function renderStats(g) {
    var box = $("stats"), pub = g.published;
    box.textContent = "";
    var words = pub.reduce(function (a, s) { return a + s.words; }, 0);
    var month = RP.todayKL().slice(0, 7);
    var thisMonth = pub.filter(function (s) { return s.date.slice(0, 7) === month; }).length;
    var counts = {};
    pub.forEach(function (s) { s.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); }).slice(0, 3);
    [["Published posts", String(pub.length)], ["Total words", num(words)], ["Posts this month", String(thisMonth)]].forEach(function (x) {
      var c = el("div", "stat");
      c.appendChild(el("div", "k", x[0])); c.appendChild(el("div", "v", x[1])); box.appendChild(c);
    });
    var c = el("div", "stat");
    c.appendChild(el("div", "k", "Top topics"));
    c.appendChild(el("div", "v sm", top.length ? top.map(function (t) { return t + " (" + counts[t] + ")"; }).join(" · ") : "none yet"));
    box.appendChild(c);
  }

  /* ── actions ── */
  function go(href) { location.href = href; }
  function editHref(s) { return s.kind === "draft" ? "write.html?draft=" + encodeURIComponent(s.id) : "write.html?slug=" + encodeURIComponent(s.slug); }
  function viewHref(s, tab) { return "post.html?slug=" + encodeURIComponent(s.slug) + (tab === "scheduled" ? "&preview=1" : ""); }

  function actionsFor(s, tab) {
    if (tab === "draft") return [["edit", "Edit"], ["publish", s.unfinished ? "Finish publishing…" : "Publish or schedule…"], ["delete", s.unfinished ? "Delete and clean up" : "Delete"]];
    var base = [["edit", "Edit"], ["view", tab === "scheduled" ? "Preview" : "View"]];
    if (tab === "published") return base.concat([["unlist", "Make unlisted"], ["schedule", "Schedule…"], ["unpublish", "Unpublish"], ["delete", "Delete"]]);
    if (tab === "unlisted") return base.concat([["public", "Make public"], ["schedule", "Schedule…"], ["unpublish", "Unpublish"], ["delete", "Delete"]]);
    return base.concat([["schedule", "Change date…"], ["unpublish", "Move back to drafts"], ["delete", "Delete"]]);
  }

  // Runs job(dir) with the rumi-pulp folder. The first time (no folder remembered) it asks for the folder, then runs the same job.
  function start(job, pick) {
    if (busy) return;
    if (!RPO.HAS_PICKER) { say(NEEDS_CHROME); return; }
    busy = true; setBusy(true);
    Promise.resolve().then(function () { return RPO.openRepo(!!pick); }).then(function (repo) {
      if (!repo) { intro(job); return; }
      return job(repo.dir);
    }).catch(function (e) { say(RPO.explain(e)); }).then(function () {
      busy = false; setBusy(false);
      return reload();
    }).then(function () { render(); checkFeed(); });
  }

  /* ── RSS feed: a scheduled story that has gone live is only added to feed.xml when the feed is next rebuilt ── */
  function checkFeed() {
    var box = $("feed-notice");
    var now = Date.now();
    var due = POSTS.filter(function (p) { return p.publishAt && RP.isLive(p, now); });
    if (!due.length) { box.hidden = true; return; }
    var newest = RP.sortPosts(POSTS.filter(function (p) { return RP.isLive(p, now); })).slice(0, 20).map(function (p) { return p.slug; });
    fetch("feed.xml", { cache: "no-cache" }).then(function (r) { return r.ok ? r.text() : ""; }, function () { return ""; }).then(function (text) {
      var inFeed = {};
      (text.match(/post\.html\?slug=[a-z0-9-]+/g) || []).forEach(function (m) { inFeed[m.slice(15)] = true; });
      var missing = due.filter(function (p) { return newest.indexOf(p.slug) >= 0 && !inFeed[p.slug]; });
      if (!missing.length) { box.hidden = true; return; }
      box.textContent = "";
      box.appendChild(el("span", null, (missing.length === 1 ? "1 scheduled post is" : missing.length + " scheduled posts are") + " now live. Update your RSS feed so followers can see " + (missing.length === 1 ? "it" : "them") + ". "));
      var b = el("button", "btn small", "Update RSS feed"); b.type = "button";
      b.addEventListener("click", function () {
        start(function (dir) { return RPO.rebuildFeed(dir).then(function () { say("The RSS feed was updated." + commitNote()); }); });
      });
      box.appendChild(b);
      box.hidden = false;
    });
  }
  function intro(job) {
    var m = $("st-msg");
    m.textContent = "";
    m.appendChild(el("div", null, "Choose your rumi-pulp folder (the one that contains index.html). You only need to do this once; your browser will remember it."));
    var b = el("button", "btn primary", "Choose folder");
    b.type = "button";
    b.addEventListener("click", function () { start(job, true); });
    m.appendChild(b);
    b.focus();
  }
  function setBusy(on) { $("st-panel").inert = on; $("st-tabs").inert = on; if (on) say("Working…"); }

  function commitNote(extra) { return " " + (extra || "") + "To update the live site, commit and push (GitHub Desktop: Commit to main, then Push origin)."; }

  // Move a published story back into a local draft (text, pictures and settings), then take it off the site.
  async function unpublish(p, dir) {
    var files = await RPO.readPostFiles(dir, p.slug), id = RPO.newId();
    for (var i = 0; i < files.images.length; i++) await RPO.imgPut(id, files.images[i].name, files.images[i].blob);
    var prev = null;
    if (p.image) {
      var mm = /^images\/[^/]+\/(.+)$/.exec(p.image);
      prev = mm ? { name: mm[1] } : { remote: p.image };
    }
    var rec = {
      id: id, title: p.title, subtitle: p.subtitle, body: files.md, words: p.words, saved: new Date().toISOString(), fromSlug: p.slug,
      settings: {
        displayTitle: p.displayTitle, displaySubtitle: p.displaySubtitle, tags: p.tags, dropCap: p.dropCap, visibility: p.visibility === "unlisted" ? "unlisted" : "public",
        canonical: p.canonical, previewImage: prev
      }
    };
    if (!RPO.putDraft(rec)) throw new RPO.PublishError("Couldn't save a draft copy in this browser, so nothing was removed from the site.");
    await RPO.removePost(dir, p.slug, { id: p.id });
  }

  function runAction(s, a, tab) {
    closeMenu();
    if (a === "edit") { go(editHref(s)); return; }
    if (a === "view") { go(viewHref(s, tab)); return; }
    if (a === "publish") { go(editHref(s) + "#/publish"); return; }
    if (a === "schedule") { scheduling = s.slug; say(""); render(); var f = $("sch-date"); if (f) f.focus(); return; }
    if (a === "delete") {
      if (s.kind === "draft" && s.unfinished) {
        if (!window.confirm("Delete the draft “" + s.title + "”? An earlier publish attempt left files in your rumi-pulp folder (posts/" + s.unfinished + "…). They are removed too. This can't be undone.")) return;
        start(function (dir) {
          return RPO.removePost(dir, s.unfinished, { id: s.partialId }).then(function () {
            RPO.removeDraft(s.id); RPO.imgDrop(s.id);
            say("The draft “" + s.title + "” and the files from its unfinished publish were deleted." + commitNote());
          });
        });
      } else if (s.kind === "draft") {
        if (!window.confirm("Delete the draft “" + s.title + "”? This can't be undone.")) return;
        RPO.removeDraft(s.id); RPO.imgDrop(s.id);
        say("The draft “" + s.title + "” was deleted.");
        render(true);
      } else {
        if (!window.confirm("Delete “" + s.title + "” from the site? Its text and pictures are removed from your rumi-pulp folder. This can't be undone.")) return;
        start(function (dir) {
          return RPO.removePost(dir, s.slug, { id: s.id }).then(function () { say("“" + s.title + "” was deleted." + commitNote()); });
        });
      }
      return;
    }
    if (a === "unlist" || a === "public") {
      start(function (dir) {
        return RPO.updateEntry(dir, s.slug, { visibility: a === "unlist" ? "unlisted" : "public" }, s.id).then(function () {
          say(a === "unlist" ? "“" + s.title + "” is now unlisted. Only people with the link can read it." + commitNote()
            : "“" + s.title + "” is public again." + commitNote());
        });
      });
      return;
    }
    if (a === "unpublish") {
      start(function (dir) {
        return unpublish(s, dir).then(function () { say("“" + s.title + "” moved back to drafts." + commitNote()); });
      });
    }
  }

  function saveSchedule(slug) {
    var d = $("sch-date").value, t = $("sch-time").value;
    if (!d || !t) { say("Choose a date and a time."); return; }
    var iso = RP.klIso(d, t);
    if (!(Date.parse(iso) > Date.now())) { say("That time has already passed in Kuala Lumpur. Pick a later date or time."); return; }
    var p = POSTS.filter(function (x) { return x.slug === slug; })[0];
    scheduling = null;
    start(function (dir) {
      return RPO.updateEntry(dir, slug, { publishAt: iso }, p ? p.id : undefined).then(function () {
        say("“" + (p ? p.title : slug) + "” is scheduled. Hidden on your blog until " + RP.klLabel(iso) + ". Its text file is on GitHub, so someone with the exact link could read it early." + commitNote());
      });
    });
  }

  /* ── menu ── */
  function closeMenu(focusBtn) {
    if (!openMenu) return;
    var m = openMenu; openMenu = null;
    m.menu.remove(); m.btn.setAttribute("aria-expanded", "false");
    if (focusBtn) m.btn.focus();
  }
  function toggleMenu(btn, s, tab) {
    var was = openMenu && openMenu.btn === btn;
    closeMenu();
    if (was) return;
    var menu = el("div", "menu");
    menu.setAttribute("role", "menu");
    menu.addEventListener("keydown", function (e) {
      var items = Array.prototype.slice.call(menu.querySelectorAll("button")), i = items.indexOf(document.activeElement), n = null;
      if (e.key === "ArrowDown") n = (i + 1) % items.length;
      else if (e.key === "ArrowUp") n = (i - 1 + items.length) % items.length;
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = items.length - 1;
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeMenu(true); return; }
      else if (e.key === "Tab") { closeMenu(); return; }
      if (n === null) return;
      e.preventDefault(); items[n].focus();
    });
    menu.addEventListener("focusout", function (e) {
      if (e.relatedTarget && !menu.contains(e.relatedTarget) && e.relatedTarget !== btn) closeMenu();
    });
    actionsFor(s, tab).forEach(function (a) {
      var b = el("button", a[0] === "delete" ? "danger" : "", a[1]);
      b.type = "button"; b.setAttribute("role", "menuitem");
      b.addEventListener("click", function () { runAction(s, a[0], tab); });
      menu.appendChild(b);
    });
    btn.parentNode.appendChild(menu);
    btn.setAttribute("aria-expanded", "true");
    openMenu = { menu: menu, btn: btn };
    menu.firstChild.focus();
  }
  document.addEventListener("click", function (e) { if (openMenu && !openMenu.menu.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { if (openMenu) closeMenu(true); else if (scheduling) { scheduling = null; render(true); } } });

  /* ── tabs and rows ── */
  function emptyText(tab) {
    return {
      draft: "No drafts yet. Anything you write is saved here automatically.",
      published: "Nothing published yet.",
      unlisted: "No unlisted stories. An unlisted story can be read by anyone with the link, but it doesn't show on the blog.",
      scheduled: "Nothing scheduled. A scheduled story is hidden on your blog until the date you choose."
    }[tab];
  }
  function render(keepFocus) {
    var g = groups();
    var tabs = $("st-tabs");
    tabs.textContent = "";
    TABS.forEach(function (t) {
      var b = el("button", null, t[1] + " " + g[t[0]].length);
      b.type = "button"; b.id = "tab-" + t[0]; b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(activeTab === t[0]));
      b.setAttribute("aria-controls", "st-panel");
      b.tabIndex = activeTab === t[0] ? 0 : -1;
      b.addEventListener("click", function () { activeTab = t[0]; scheduling = null; say(""); render(true); });
      b.addEventListener("keydown", function (e) {
        var i = TABS.map(function (x) { return x[0]; }).indexOf(t[0]), n = null;
        if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
        if (e.key === "ArrowLeft") n = (i + TABS.length - 1) % TABS.length;
        if (n === null) return;
        e.preventDefault(); activeTab = TABS[n][0]; scheduling = null; render(true);
      });
      tabs.appendChild(b);
    });
    $("st-panel").setAttribute("aria-labelledby", "tab-" + activeTab);
    var list = $("st-list"), rows = g[activeTab];
    list.textContent = "";
    if (postsFailed && activeTab !== "draft") list.appendChild(el("li", "st-empty", "Couldn't read the list of published stories (posts/index.json)."));
    else if (!rows.length) list.appendChild(el("li", "st-empty", emptyText(activeTab)));
    rows.forEach(function (s) { list.appendChild(row(s, activeTab)); });
    renderStats(g);
    if (keepFocus) { var f = $("tab-" + activeTab); if (f && !(document.activeElement && list.contains(document.activeElement))) f.focus(); }
  }
  function row(s, tab) {
    var li = el("li", "st-row"), main = el("div", "st-main");
    var t = el("button", "t", s.title); t.type = "button";
    t.addEventListener("click", function () { runAction(s, s.kind === "draft" ? "edit" : "view", tab); });
    main.appendChild(t);
    if (s.subtitle) main.appendChild(el("div", "sub", s.subtitle));
    var meta = [];
    if (s.kind === "draft") { if (s.date) meta.push("Edited " + RP.niceDate(s.date)); if (s.editSlug) meta.push("editing a published story"); if (s.unfinished) meta.push("unfinished publish: finish or clean up"); }
    else if (tab !== "scheduled") meta.push("Published " + RP.niceDate(s.date));
    meta.push(num(s.words) + " words · " + RP.readTime(s.words) + " min read");
    if (s.tags.length) meta.push(s.tags.join(", "));
    main.appendChild(el("div", "meta", meta.join(" · ")));
    if (tab === "scheduled") {
      main.appendChild(el("div", "live", "goes live " + (RP.klLabel(s.publishAt) || "at a time that can't be read")));
      main.appendChild(el("div", "meta", "hidden on your blog until this date; its text file is on GitHub, so someone with the exact link could read it early"));
    }
    if (scheduling && scheduling === s.slug) main.appendChild(scheduleForm(s));
    var act = el("div", "st-act"), ab = el("button", "btn small", "Actions");
    ab.type = "button"; ab.setAttribute("aria-haspopup", "menu"); ab.setAttribute("aria-expanded", "false");
    ab.setAttribute("aria-label", "Actions for " + s.title);
    ab.addEventListener("click", function (e) { e.stopPropagation(); toggleMenu(ab, s, tab); });
    act.appendChild(ab);
    li.appendChild(main); li.appendChild(act);
    return li;
  }
  function scheduleForm(s) {
    var w = el("form", "st-when");
    w.setAttribute("aria-label", "Schedule " + s.title);
    var now = RP.klNow(), cur = s.publishAt && Date.parse(s.publishAt) > Date.now() ? RP.klNow(new Date(Date.parse(s.publishAt))) : null;
    var d = el("input", "field"); d.type = "date"; d.id = "sch-date"; d.min = now.date; d.value = cur ? cur.date : now.date; d.setAttribute("aria-label", "Date");
    var t = el("input", "field"); t.type = "time"; t.id = "sch-time"; t.value = cur ? cur.time : "21:00"; t.setAttribute("aria-label", "Time (Kuala Lumpur)");
    var ok = el("button", "btn small primary", "Schedule"); ok.type = "submit";
    var no = el("button", "btn small", "Cancel"); no.type = "button";
    no.addEventListener("click", function () { scheduling = null; render(true); });
    w.appendChild(d); w.appendChild(t); w.appendChild(ok); w.appendChild(no);
    w.addEventListener("submit", function (e) { e.preventDefault(); saveSchedule(s.slug); });
    w.appendChild(el("div", "meta", "Times are Kuala Lumpur time."));
    return w;
  }

  reload().then(function () {
    var q = new URLSearchParams(location.search).get("tab");
    if (TABS.some(function (t) { return t[0] === q; })) activeTab = q;
    render(false);
    checkFeed();
  });
})();
