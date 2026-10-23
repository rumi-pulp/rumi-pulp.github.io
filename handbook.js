/* rumi-pulp — handbook (home, chapters, search, read marks) */
(function () {
  "use strict";
  var RP = window.RP, $ = RP.$, el = RP.el;

  var SLUG_RE = /^[a-z0-9-]+$/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var WPM = 200;
  var READ_KEY = "rp:hb-read";
  var REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ── data (filled from handbook/index.json) ── */
  var DATA = { title: "Handbook", subtitle: "", intro: "", parts: [] };
  var CH = [], BY = Object.create(null);   // lookup maps have no prototype, so a slug like "constructor" is just a slug
  var ready = false, view = "msg", firstRoute = true;
  var current = null, bodyReady = false, loadToken = 0;

  function txt(s) { return document.createTextNode(s); }
  function str(v) { return typeof v === "string" ? v : ""; }
  function pad2(n) { return n < 10 ? "0" + n : String(n); }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  function parseIndex(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { var bad = new Error("handbook/index.json should be an object"); bad.badIndex = true; throw bad; }
    var d = { title: str(raw.title).trim() || "Handbook", subtitle: str(raw.subtitle).trim(), intro: str(raw.intro).trim(), parts: [] };
    var by = Object.create(null), list = [];
    (Array.isArray(raw.parts) ? raw.parts : []).forEach(function (p) {
      if (!p || typeof p !== "object") return;
      var part = { name: str(p.name).trim() || "Chapters", who: str(p["for"]).trim(), about: str(p.about).trim(), chapters: [], n: 0 };
      (Array.isArray(p.chapters) ? p.chapters : []).forEach(function (c) {
        if (!c || typeof c !== "object") return;
        var slug = c.slug, title = str(c.title).trim();
        if (typeof slug !== "string" || !SLUG_RE.test(slug) || by[slug] || !title) return;
        var ch = {
          slug: slug, title: title, part: part, num: 0,
          minutes: Number(c.minutes) > 0 ? Math.max(1, Math.round(Number(c.minutes))) : 0,
          updated: typeof c.updated === "string" && DATE_RE.test(c.updated) ? c.updated : "",
          words: 0, html: "", text: "", loaded: false
        };
        by[slug] = ch; list.push(ch); part.chapters.push(ch);
      });
      if (part.chapters.length) d.parts.push(part);
    });
    d.parts.forEach(function (p, i) { p.n = i + 1; });
    list.forEach(function (c, i) { c.num = i + 1; });
    DATA = d; CH = list; BY = by;
  }
  function mins(c) { return c.minutes || (c.words ? Math.max(1, Math.round(c.words / WPM)) : 0); }

  /* ── what the visitor has read (kept only in this browser) ── */
  var READ = [];
  function loadRead() {
    var list = [];
    try { list = JSON.parse(RP.store.get(READ_KEY)); } catch (e) { list = []; }
    READ = Array.isArray(list) ? list.filter(function (s) { return typeof s === "string" && BY[s]; }) : [];
  }
  function saveRead() { RP.store.set(READ_KEY, JSON.stringify(READ)); }
  function isRead(slug) { return READ.indexOf(slug) > -1; }
  function readCount() { return CH.filter(function (c) { return isRead(c.slug); }).length; }
  function nextUnread() { for (var i = 0; i < CH.length; i++) if (!isRead(CH[i].slug)) return CH[i]; return null; }
  function markRead(slug) {
    if (!BY[slug] || isRead(slug)) return;
    READ.push(slug); saveRead(); refreshMarks();
  }
  function clearRead() { READ = []; saveRead(); refreshMarks(); }
  // The same marker everywhere: "[x]" for read, "[ ]" for not read yet.
  function markText(slug) { return isRead(slug) ? "[x]" : "[ ]"; }

  /* ── loading a chapter ── */
  var cache = Object.create(null);
  function plainText(doc) {
    var out = [];
    Array.prototype.forEach.call(doc.body.querySelectorAll("p, h2, h3, li, blockquote, pre, figcaption"), function (n) { out.push(n.textContent); });
    return out.join(" ").replace(/\s+/g, " ").trim();
  }
  function fetchChapter(c) {
    if (cache[c.slug]) return cache[c.slug];
    var p = fetch("handbook/" + c.slug + ".md", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) { var e = new Error("chapter returned " + r.status); e.notFound = r.status === 404; throw e; }
      return r.text();
    }).then(function (md) {
      var html = RP.md(md);
      // an inert document (nothing loads, nothing runs) is used only to read the text back
      var doc = new DOMParser().parseFromString(html, "text/html");
      var first = doc.body.firstElementChild;
      // a leading heading that repeats the chapter title is dropped (the title is already shown above)
      if (first && first.tagName === "H2" && first.textContent.trim().toLowerCase() === c.title.toLowerCase() && html.indexOf("</h2>") > -1) {
        first.parentNode.removeChild(first);
        html = html.slice(html.indexOf("</h2>") + 5);
      }
      c.html = html;
      c.text = plainText(doc);
      c.words = RP.countWords(c.text);
      c.loaded = true;
      return c;
    });
    cache[c.slug] = p;
    p.catch(function () { if (cache[c.slug] === p) delete cache[c.slug]; });
    return p;
  }
  var allLoaded = false;
  function ensureAll() {
    // only "all loaded" when every chapter really arrived; failed ones are tried again on the next search
    return Promise.all(CH.map(function (c) { return fetchChapter(c).catch(function () { return null; }); })).then(function () {
      allLoaded = CH.every(function (c) { return c.loaded; });
    });
  }

  /* ═════════════ home ═════════════ */
  function totalMinutes() {
    var t = 0;
    for (var i = 0; i < CH.length; i++) { var m = mins(CH[i]); if (!m) return 0; t += m; }
    return t;
  }
  function askReset(on) {
    $("reset-ask").hidden = !on;
    $("reset-btn").hidden = on;
  }
  function renderStart() {
    var n = readCount(), nx = nextUnread(), btn = $("start-btn");
    if (n === 0) { btn.textContent = "Start with chapter 1"; btn.href = "#/" + CH[0].slug; }
    else if (nx) { btn.textContent = "Continue: " + nx.title; btn.href = "#/" + nx.slug; }
    else { btn.textContent = "Read it again from chapter 1"; btn.href = "#/" + CH[0].slug; }
    var tm = totalMinutes();
    $("start-promise").textContent = plural(CH.length, "short chapter", "short chapters") + (tm ? " · about " + plural(tm, "minute", "minutes") + " in total" : "") + (CH.length > 1 ? ", read in any order" : "");
    $("start-prog").hidden = n === 0;
    askReset(false);
    if (n > 0) {
      $("prog-t").textContent = n === CH.length ? "You have read all " + CH.length + (CH.length === 1 ? " chapter" : " chapters") : "You have read " + n + " of " + CH.length + " chapters";
      $("prog-i").style.width = Math.round(n / CH.length * 100) + "%";
    }
  }
  function renderParts() {
    var box = $("parts");
    box.textContent = "";
    DATA.parts.forEach(function (p) {
      var part = el("section", "part"), head = el("div", "part-head");
      head.appendChild(el("div", "pn", "Part " + p.n + " of " + DATA.parts.length));
      var h = el("h3"), ha = el("a", null, p.name); ha.href = "#/" + p.chapters[0].slug; h.appendChild(ha);
      head.appendChild(h);
      if (p.who) head.appendChild(el("p", "pd", p.who));
      if (p.about) head.appendChild(el("p", "pb", p.about));
      part.appendChild(head);
      var ul = el("ul", "pc-list");
      p.chapters.forEach(function (c) {
        var li = el("li"), a = el("a"); a.href = "#/" + c.slug;
        var mk = el("span", "mk" + (isRead(c.slug) ? " on" : ""), markText(c.slug)); mk.setAttribute("aria-hidden", "true");
        var t = el("span", "t", c.title);
        if (isRead(c.slug)) t.appendChild(el("span", "sr-only", " (you have read this)"));
        var m = mins(c);
        a.appendChild(mk); a.appendChild(el("span", "n", pad2(c.num))); a.appendChild(t); a.appendChild(el("span", "tm", m ? m + " min" : ""));
        li.appendChild(a); ul.appendChild(li);
      });
      part.appendChild(ul);
      box.appendChild(part);
    });
  }
  function renderHome() { renderStart(); renderParts(); }
  function buildHome() {
    $("home-h").textContent = DATA.title;
    var sub = $("home-sub"); sub.textContent = DATA.subtitle; sub.hidden = !DATA.subtitle;
    var intro = $("home-intro"); intro.textContent = DATA.intro; intro.hidden = !DATA.intro;
  }
  $("reset-btn").addEventListener("click", function () { askReset(true); $("reset-no").focus(); });
  $("reset-no").addEventListener("click", function () { askReset(false); $("reset-btn").focus(); });
  $("reset-yes").addEventListener("click", function () { clearRead(); renderHome(); $("start-btn").focus(); });

  /* ═════════════ search (titles and chapter text) ═════════════ */
  function search(q) {
    var words = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8), out = [];
    if (!words.length) return out;
    CH.forEach(function (c) {
      var t = c.title.toLowerCase(), b = c.text.toLowerCase();
      var all = words.every(function (w) { return t.indexOf(w) > -1 || b.indexOf(w) > -1; });
      if (!all) return;
      var pos = -1;
      words.forEach(function (w) { var i = b.indexOf(w); if (i > -1 && (pos < 0 || i < pos)) pos = i; });
      out.push({ c: c, inTitle: words.some(function (w) { return t.indexOf(w) > -1; }), pos: pos < 0 ? 0 : pos });
    });
    out.sort(function (a, b) { return (b.inTitle - a.inTitle) || (a.c.num - b.c.num); });
    return out;
  }
  function highlight(text, re) {
    var f = document.createDocumentFragment(), last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      if (m.index > last) f.appendChild(txt(text.slice(last, m.index)));
      f.appendChild(el("mark", null, m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) f.appendChild(txt(text.slice(last)));
    return f;
  }
  function snippet(t, pos) {
    var s = Math.max(0, pos - 60), e;
    if (s > 0) { var sp = t.indexOf(" ", s); if (sp > -1 && sp < pos) s = sp + 1; }
    e = Math.min(t.length, s + 170);
    if (e < t.length) { var sp2 = t.lastIndexOf(" ", e); if (sp2 > s + 80) e = sp2; }
    return (s > 0 ? "… " : "") + t.slice(s, e) + (e < t.length ? " …" : "");
  }
  // Connects one search box to a results area. Returns a function that re-runs the search.
  function bindSearch(input, wrap, countEl, listEl, onActive) {
    var seq = 0;
    function draw(q) {
      var res = search(q);
      listEl.textContent = "";
      if (!res.length) { countEl.textContent = "Nothing found for “" + q + "”. Try a shorter word."; return; }
      countEl.textContent = (res.length === 1 ? "1 chapter matches " : res.length + " chapters match ") + "“" + q + "”";
      var re = new RegExp(q.split(/\s+/).filter(Boolean).slice(0, 8).map(escRe).join("|"), "gi");
      res.forEach(function (r) {
        var li = el("li"), a = el("a"); a.href = "#/" + r.c.slug;
        var t = el("span", "rt"); t.appendChild(highlight(r.c.title, re));
        a.appendChild(t);
        a.appendChild(el("span", "rm", "Part " + r.c.part.n + " · " + r.c.part.name + " · Chapter " + r.c.num));
        if (r.c.text) {
          var s = el("span", "rs"); s.appendChild(highlight(snippet(r.c.text, r.pos), re));
          a.appendChild(s);
        }
        li.appendChild(a); listEl.appendChild(li);
      });
    }
    function run() {
      var q = input.value.trim().slice(0, 100), my = ++seq;
      listEl.textContent = "";
      if (!q) { wrap.hidden = true; countEl.textContent = ""; onActive(false); return; }
      wrap.hidden = false; onActive(true);
      if (allLoaded) { draw(q); return; }
      countEl.textContent = "Searching…";
      ensureAll().then(function () { if (my === seq) draw(q); });
    }
    input.addEventListener("input", run);
    listEl.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a") : null;
      if (a && location.hash === a.getAttribute("href")) { e.preventDefault(); route(); }
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (input.value) { input.value = ""; run(); } else input.blur();
      } else if (e.key === "Enter") {
        var a = listEl.querySelector("a");
        if (a) {
          e.preventDefault();
          if (location.hash === a.getAttribute("href")) route(); else location.hash = a.getAttribute("href");
        }
      }
    });
    return run;
  }
  var runHome = bindSearch($("home-q"), $("home-results"), $("home-count"), $("home-list"), function (on) { $("home-main").hidden = on; });
  var runSide = bindSearch($("side-q"), $("side-results"), $("side-count"), $("side-list"), function (on) { $("side-tree").hidden = on; });

  /* ═════════════ sidebar: every part open, all chapters visible ═════════════ */
  function buildTree() {
    var nav = $("side-tree");
    Array.prototype.slice.call(nav.querySelectorAll(".tp-wrap")).forEach(function (n) { nav.removeChild(n); });
    DATA.parts.forEach(function (p) {
      var wrap = el("div", "tp-wrap");
      wrap.appendChild(el("div", "tp", "Part " + p.n + " · " + p.name));
      var ul = el("ul", "tl");
      p.chapters.forEach(function (c) {
        var li = el("li"), a = el("a"); a.href = "#/" + c.slug; a.dataset.slug = c.slug;
        var mk = el("span", "mk"); mk.setAttribute("aria-hidden", "true");
        var tt = el("span", "tt");
        tt.appendChild(el("span", "ttx", c.title));
        tt.appendChild(el("span", "sr-only rd"));
        tt.appendChild(el("span", "here", "you are here"));
        a.appendChild(mk); a.appendChild(el("span", "n", pad2(c.num))); a.appendChild(tt);
        li.appendChild(a); ul.appendChild(li);
      });
      wrap.appendChild(ul); nav.appendChild(wrap);
    });
    refreshMarks();
  }
  function refreshMarks() {
    Array.prototype.forEach.call($("side-tree").querySelectorAll("a"), function (a) {
      var s = a.dataset.slug;
      a.querySelector(".mk").textContent = markText(s);
      a.querySelector(".rd").textContent = isRead(s) ? " (you have read this)" : "";
    });
  }
  function openSide(open) {
    $("side-panel").classList.toggle("open", open);
    $("side-toggle").setAttribute("aria-expanded", String(open));
    $("side-glyph").textContent = open ? "-" : "+";
  }
  $("side-toggle").addEventListener("click", function () { openSide(!$("side-panel").classList.contains("open")); });
  function markCurrent(c) {
    var cur = null;
    Array.prototype.forEach.call($("side-tree").querySelectorAll("a"), function (a) {
      if (a.dataset.slug === c.slug) { a.setAttribute("aria-current", "page"); cur = a; } else a.removeAttribute("aria-current");
    });
    var s = $("side");
    if (cur && s.scrollHeight > s.clientHeight) {
      var lr = cur.getBoundingClientRect(), sr = s.getBoundingClientRect();
      if (lr.top < sr.top || lr.bottom > sr.bottom) s.scrollTop += lr.top - sr.top - 60;
    }
  }

  /* ═════════════ chapter page ═════════════ */
  var heads = [], olinks = [], byId = Object.create(null), activeIdx = -2, io = null;
  function setActive(i) {
    if (i === activeIdx) return;
    activeIdx = i;
    olinks.forEach(function (a, k) { if (k === i) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current"); });
  }
  function syncOutline() {
    if (!heads.length) return;
    var cur = -1;
    heads.forEach(function (h, i) { if (h.getBoundingClientRect().top <= 100) cur = i; });
    if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) cur = heads.length - 1;
    setActive(cur);
  }
  function clearOutline() {
    $("ch-outline").textContent = "";
    heads = []; olinks = []; byId = Object.create(null); activeIdx = -2;
    if (io) { io.disconnect(); io = null; }
  }
  function buildOutline(c) {
    var box = $("ch-outline"), seen = Object.create(null);
    clearOutline();
    heads = Array.prototype.slice.call($("ch-body").querySelectorAll("h2, h3"));
    if (!heads.length) { box.appendChild(el("p", null, "This is a short chapter with no sections.")); return; }
    var ul = el("ul");
    heads.forEach(function (h) {
      var id = RP.slugify(h.textContent) || "section";
      if (seen[id]) { seen[id]++; id += "-" + seen[id]; } else seen[id] = 1;
      var other = document.getElementById(id);
      if (other && other !== h) id += "-section";   // never clash with an id the page itself uses
      h.id = id; byId[id] = h;
      var li = el("li"), a = el("a", h.tagName === "H3" ? "l3" : "", h.textContent);
      a.href = "#/" + c.slug + "/" + id;
      li.appendChild(a); ul.appendChild(li); olinks.push(a);
    });
    box.appendChild(ul);
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(syncOutline, { rootMargin: "-90px 0px -55% 0px", threshold: [0, 1] });
      heads.forEach(function (h) { io.observe(h); });
    }
  }
  function scrollToSec(id, smooth) {
    var h = id && byId[id];
    if (!h) return false;
    h.scrollIntoView({ behavior: smooth && !REDUCED ? "smooth" : "auto", block: "start" });
    var i = heads.indexOf(h); if (i > -1) setActive(i);
    return true;
  }
  $("ch-outline").addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    if (location.hash === a.getAttribute("href")) { e.preventDefault(); scrollToSec(a.getAttribute("href").split("/")[2], true); }
  });

  // A plain-words sentence about how far along the visitor is.
  function whereAmI(c) {
    if (CH.length === 1) return "this is the only chapter";
    if (c.num === 1) return "you are at the very start";
    if (c.num === CH.length) return "this is the last chapter";
    var f = c.num / CH.length, opts = [[0.25, "a quarter of the way through"], [1 / 3, "a third of the way through"], [0.5, "halfway through"], [2 / 3, "two thirds of the way through"], [0.75, "three quarters of the way through"]];
    var best = opts[0];
    opts.forEach(function (o) { if (Math.abs(o[0] - f) < Math.abs(best[0] - f)) best = o; });
    return "you are about " + best[1];
  }
  function setOrient(c) {
    var bits = ["Chapter " + c.num + " of " + CH.length], m = mins(c);
    if (m) bits.push(m + " min read");
    bits.push(whereAmI(c));
    if (c.updated) bits.push("Updated " + RP.niceDate(c.updated));
    $("ch-orient").textContent = bits.join(" · ");
  }
  function buildPn(c) {
    var pn = $("ch-pn"); pn.textContent = "";
    var prev = CH[c.num - 2], next = CH[c.num];
    if (next) {
      var a = el("a", "pn-next", "Next: " + next.title + " →"); a.href = "#/" + next.slug;
      pn.appendChild(a);
    } else {
      var done = el("div", "pn-done");
      done.appendChild(el("h2", null, "You finished the handbook"));
      done.appendChild(el("p", null, "That was the last chapter. Thank you for reading. You can go back to any chapter whenever you like."));
      var home = el("a", "btn primary", "Back to all chapters"); home.href = "#/";
      done.appendChild(home);
      pn.appendChild(done);
    }
    if (prev) {
      var pa = el("a", "pn-prev", "← Previous: " + prev.title); pa.href = "#/" + prev.slug;
      pn.appendChild(pa);
    }
  }
  $("ch-pn").addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a.pn-next, .pn-done a") : null;
    if (a && current && bodyReady) markRead(current.slug);
  });

  function showChapterShell(c) {
    current = c; bodyReady = false; scrolled = false;
    $("ch-part").textContent = "Part " + c.part.n + " of " + DATA.parts.length + " · " + c.part.name;
    $("ch-title").textContent = c.title;
    setOrient(c);
    var body = $("ch-body"); body.textContent = "";
    body.appendChild(el("p", "hb-msg", "Loading…"));
    $("ch-pn").textContent = "";
    clearOutline();
    markCurrent(c);
  }
  function loadBody(c, sec, token) {
    fetchChapter(c).then(function () {
      if (token !== loadToken || current !== c) return;
      $("ch-body").innerHTML = c.html;   // from RP.md, which escapes all text first (same as posts)
      bodyReady = true;
      setOrient(c);
      buildOutline(c);
      buildPn(c);
      if (!(sec && scrollToSec(sec, false))) syncOutline();
      onScroll();
    }, function (err) {
      if (token !== loadToken || current !== c) return;
      if (err && err.notFound) { showNotFound(true); return; }
      var body = $("ch-body"); body.textContent = "";
      var p = el("p", "hb-msg", "This chapter could not be loaded. Try again later. ");
      var back = el("a", null, "Back to all chapters"); back.href = "#/";
      p.appendChild(back);
      body.appendChild(p);
      var retry = el("button", "tbtn", "Try again");
      retry.type = "button";
      retry.addEventListener("click", function () {
        body.textContent = ""; body.appendChild(el("p", "hb-msg", "Loading…"));
        loadBody(c, sec, ++loadToken);
      });
      body.appendChild(retry);
    });
  }

  /* ═════════════ routing: #/ is home, #/<chapter> a chapter, #/<chapter>/<heading> a spot inside it ═════════════ */
  function show(v) {
    view = v;
    $("view-msg").hidden = v !== "msg";
    $("view-home").hidden = v !== "home";
    $("view-chapter").hidden = v !== "chapter";
    $("progress").hidden = v !== "chapter";
    if (v !== "chapter") {
      $("progress-i").style.transform = "scaleX(0)";
      if (io) { io.disconnect(); io = null; }
    }
  }
  function showMessage(text, docTitle) {
    ready = false;
    show("msg");
    $("msg-h").textContent = "Handbook";
    $("msg-p").textContent = text;
    $("msg-link").hidden = true;
    document.title = (docTitle || "Handbook") + " — rumi-pulp";
  }
  // A chapter that is not in the list (or whose file is gone). The handbook itself keeps working.
  function showNotFound(focus) {
    loadToken++;
    current = null; bodyReady = false;
    show("msg");
    $("msg-h").textContent = "Not found";
    $("msg-p").textContent = "That chapter does not exist.";
    $("msg-link").hidden = false;
    document.title = "Not found — " + DATA.title + " — rumi-pulp";
    window.scrollTo(0, 0);
    if (focus) $("msg-h").focus({ preventScroll: true });
  }
  function route() {
    if (!ready) return;
    var parts = location.hash.replace(/^#\/?/, "").split("/"), slug = parts[0] || "", sec = parts[1] || "";
    if (!SLUG_RE.test(sec)) sec = "";
    if (slug && !SLUG_RE.test(slug)) { location.replace("#/"); return; }
    if (slug && !BY[slug]) { showNotFound(true); firstRoute = false; return; }
    var c = slug ? BY[slug] : null, h1;
    if (!c) {
      loadToken++;
      if (view !== "home") { $("home-q").value = ""; runHome(); }
      show("home");
      renderHome();
      document.title = DATA.title + " — rumi-pulp";
      window.scrollTo(0, 0);
      h1 = $("home-h");
    } else {
      var same = view === "chapter" && current === c;
      show("chapter");
      document.title = c.title + " — " + DATA.title + " — rumi-pulp";
      $("side-q").value = ""; runSide(); openSide(false);
      if (same && bodyReady) { if (sec) scrollToSec(sec, true); return; }
      var token = ++loadToken;
      showChapterShell(c);
      window.scrollTo(0, 0);
      loadBody(c, sec, token);
      h1 = sec ? null : $("ch-title");
    }
    onScroll();
    if (!firstRoute && h1) h1.focus({ preventScroll: true });
    firstRoute = false;
  }
  window.addEventListener("hashchange", route);

  /* ── reading progress line, outline tracking, and "read" marking ── */
  var raf = 0, scrolled = false;   // scrolled: the reader has moved the page since this chapter opened
  function onReaderInput(e) {
    if (view !== "chapter") return;
    if (e.type === "keydown") {
      var t = e.target && e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "End", "Home", " ", "Spacebar"].indexOf(e.key) < 0) return;
    }
    scrolled = true;
    onScroll();
  }
  window.addEventListener("wheel", onReaderInput, { passive: true });
  window.addEventListener("touchmove", onReaderInput, { passive: true });
  window.addEventListener("keydown", onReaderInput);
  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      if (view !== "chapter") return;
      // Reaching the Next block (or the finish block) counts as having read the chapter,
      // but only once the reader has actually scrolled, so a short chapter is not marked at page load.
      if (window.scrollY > 0) scrolled = true;
      if (scrolled && current && bodyReady && $("ch-pn").getBoundingClientRect().top < window.innerHeight) markRead(current.slug);
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      $("progress-i").style.transform = "scaleX(" + p.toFixed(4) + ")";
      syncOutline();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  /* ═════════════ start ═════════════ */
  function start(raw) {
    if (raw === null) { showMessage("The handbook is empty.", "Handbook"); return; }
    parseIndex(raw);
    if (!CH.length) { showMessage("The handbook is empty.", DATA.title); return; }
    loadRead();
    buildHome();
    buildTree();
    ready = true;
    route();
    // chapters with no `minutes` in the index get their reading time from the text once it has loaded
    var missing = CH.filter(function (c) { return !c.minutes; });
    if (missing.length) {
      Promise.all(missing.map(function (c) { return fetchChapter(c).catch(function () { return null; }); })).then(function () {
        if (view === "home" && !$("parts").contains(document.activeElement)) renderHome();
        else if (view === "chapter" && current) setOrient(current);
      });
    }
  }
  fetch("handbook/index.json", { cache: "no-cache" }).then(function (r) {
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("handbook/index.json returned " + r.status);
    return r.text().then(function (t) {
      try { return JSON.parse(t); } catch (e) { e.badIndex = true; throw e; }
    });
  }).then(start).catch(function (err) {
    if (window.console) console.error(err);
    if (err && err.badIndex) showMessage("The handbook list could not be read. Check index.json for a missing comma or quote.", "Handbook");
    else showMessage("The handbook could not be loaded. Try again later.", "Handbook");
  });
})();
