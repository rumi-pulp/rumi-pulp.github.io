/* rumi-pulp — shared by every page (status bar, theme, helpers). No page-specific logic here. */
(function () {
  "use strict";

  var RP = (window.RP = {});
  var TZ = "Asia/Kuala_Lumpur";
  var SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function $(id) { return document.getElementById(id); }

  /* ── small helpers ── */
  RP.$ = $;
  RP.SLUG_RE = SLUG_RE;
  RP.SITE = "https://rumi-pulp.github.io/";
  RP.el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  RP.store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  };

  // file:// has an empty hostname and can't read posts or save drafts reliably, so it is not the owner's setup.
  RP.isOwner = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /\.(localhost|test)$/.test(location.hostname);

  RP.countWords = function (text) { return (String(text).trim().match(/\S+/g) || []).length; };
  RP.readTime = function (words) { return Math.max(1, Math.round((Number(words) || 0) / 220)); };
  RP.niceDate = function (iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
    if (!m || +m[2] < 1 || +m[2] > 12) return String(iso == null ? "" : iso);
    return +m[3] + " " + MONTHS[+m[2] - 1] + " " + m[1];
  };
  RP.slugify = function (s) {
    return String(s).toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim()
      .replace(/[\s_]+/g, "-").replace(/-+/g, "-").slice(0, 60).replace(/^-+|-+$/g, "");
  };

  /* ── Kuala Lumpur time (UTC+8, no daylight saving) ── */
  function klParts(d) {
    var o = {};
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d || new Date()).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  RP.todayKL = function () { var o = klParts(); return o.year + "-" + o.month + "-" + o.day; };
  // { date: "YYYY-MM-DD", time: "HH:MM" } for the current moment (or the given Date) in Kuala Lumpur
  RP.klNow = function (d) {
    var o = klParts(d);
    return { date: o.year + "-" + o.month + "-" + o.day, time: o.hour + ":" + o.minute };
  };
  RP.klIso = function (date, time) { return date + "T" + time + ":00+08:00"; };
  RP.klDateOf = function (iso) { var t = Date.parse(iso); return isNaN(t) ? "" : RP.klNow(new Date(t)).date; };
  // "24 Oct 2026, 9:00 PM KL"
  RP.klLabel = function (iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) return "";
    var n = RP.klNow(new Date(t)), hh = +n.time.slice(0, 2);
    return RP.niceDate(n.date) + ", " + ((hh + 11) % 12 + 1) + ":" + n.time.slice(3) + " " + (hh >= 12 ? "PM" : "AM") + " KL";
  };

  /* ── video links: only YouTube and Vimeo can be embedded ── */
  RP.parseVideo = function (url) {
    var u = String(url).trim(), m;
    if ((m = /^https?:\/\/(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(u)) ||
        (m = /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(u))) {
      return { kind: "youtube", label: "YouTube", id: m[1], embed: "https://www.youtube-nocookie.com/embed/" + m[1], canonical: "https://www.youtube.com/watch?v=" + m[1] };
    }
    if ((m = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d{1,12})(?!\d)/.exec(u)) ||
        (m = /^https?:\/\/player\.vimeo\.com\/video\/(\d{1,12})(?!\d)/.exec(u))) {
      return { kind: "vimeo", label: "Vimeo", id: m[1], embed: "https://player.vimeo.com/video/" + m[1], canonical: "https://vimeo.com/" + m[1] };
    }
    return null;
  };

  /* ── markdown: escape first, then add a few tags. Links are http/https only, images and videos are allow-listed. ── */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function emphasis(s) {
    var bold = function (t) { return t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"); };
    s = bold(s).replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
    return bold(s);   // a second pass catches bold around italic: **a *b* c**
  }
  // Escapes, code spans and links become placeholder tokens first, so emphasis can't reach inside code or URLs.
  function inline(s) {
    var tokens = [];
    function keep(html) { tokens.push(html); return "\u0000" + (tokens.length - 1) + "\u0000"; }
    s = String(s).replace(/\u0000/g, "");
    // one left-to-right pass: a backslash before a special character makes it plain text; `code` is kept as typed
    // (a code span may use a longer backtick fence, so code can hold backticks; one padding space on each side is dropped)
    s = s.replace(/\\([\\*`\[\]#>\-.!@])|(`+)([^`]|[^`][\s\S]*?[^`])\2(?!`)/g, function (_, c, fence, code) {
      if (c) return keep(esc(c));
      if (/^ [\s\S]* $/.test(code) && code.trim()) code = code.slice(1, -1);
      return keep("<code>" + esc(code) + "</code>");
    });
    s = esc(s);
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/(?:[^()\s]|\([^()\s]*\))+)\)/g, function (_, text, url) {
      return keep('<a href="' + url + '" target="_blank" rel="noopener">' + emphasis(text) + "</a>");
    });
    s = emphasis(s);
    while (/\u0000\d+\u0000/.test(s)) s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return tokens[+i]; });
    return s;
  }
  // a line holding only a backslash is an empty line inside a paragraph (two line breaks in a row)
  function lines2html(s) { return inline(s.replace(/(^|\n)\\(?=\n|$)/g, "$1")).replace(/\n/g, "<br>"); }

  // Pictures: a path inside this site (images/<slug>/<file>) or an Unsplash photo. Nothing else.
  var IMG_REL = /^images\/[a-z0-9]+(?:-[a-z0-9]+)*\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpe?g|png|webp|gif)$/i;
  var IMG_UNS = /^https:\/\/images\.unsplash\.com\/[A-Za-z0-9._~:\/?#@!$&*+,;=%-]*$/;
  RP.imageOk = function (src) { return IMG_REL.test(src) || IMG_UNS.test(src); };
  RP.IMG_REL = IMG_REL;

  var FIG_RE = /^!\[([^\]]*)\]\(([^)\s"]+)(?:\s+"([^"]*)")?\)(?:\{\.(wide|full)\})?\s*$/;
  var VIDEO_RE = /^@\[video\]\((https?:\/\/[^)\s]+)\)\s*$/;
  var UL_RE = /^[-*]\s+/, OL_RE = /^\d+\.\s+/;

  function figure(m) {
    var src = m[2];
    if (!RP.imageOk(src)) return null;
    // post files live in posts/, pages in the site root: images/... is resolved from posts/
    var url = IMG_REL.test(src) ? "posts/" + src : src;
    var cap = m[3] ? "<figcaption>" + inline(m[3]) + "</figcaption>" : "";
    return '<figure class="mk-fig' + (m[4] ? " " + m[4] : "") + '"><img src="' + esc(url) + '" alt="' + esc(m[1]) + '" loading="lazy" decoding="async">' + cap + "</figure>";
  }
  function video(url) {
    var v = RP.parseVideo(url);
    if (!v) return '<p><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + "</a></p>";
    return '<div class="mk-video" data-url="' + esc(v.canonical) + '"><iframe src="' + v.embed + '" title="' + v.label + ' video" loading="lazy" ' +
      'allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
  }

  function md(src) {
    var lines = String(src).replace(/\r/g, "").split("\n"), out = [], i = 0, m;
    while (i < lines.length) {
      var line = lines[i];
      if (!line.trim()) { i++; continue; }

      if ((m = /^(`{3,})[^`]*$/.exec(line.replace(/\s+$/, "")))) {         // fenced code (escaped, not highlighted)
        var closer = new RegExp("^`{" + m[1].length + ",}\\s*$"), buf = [];
        i++;
        while (i < lines.length && !closer.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push('<pre class="mk-code">' + (buf.length && buf[0] === "" ? "\n" : "") + esc(buf.join("\n")) + "</pre>");
        continue;
      }
      if (/^-{3,}\s*$/.test(line)) {                                       // section break
        out.push('<div class="mk-stars" role="separator" aria-label="section break"><span aria-hidden="true">* * *</span></div>');
        i++; continue;
      }
      if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) {                          // # and ## are headings, ### a subheading
        var tag = m[1].length === 3 ? "h3" : "h2";
        out.push("<" + tag + ">" + inline(m[2].trim()) + "</" + tag + ">");
        i++; continue;
      }
      if ((m = FIG_RE.exec(line))) {
        var f = figure(m);
        if (f) { out.push(f); i++; continue; }
      }
      if ((m = VIDEO_RE.exec(line))) { out.push(video(m[1])); i++; continue; }

      var buf2 = [];
      if (/^>/.test(line)) {                                               // quote: the whole block, as before
        while (i < lines.length && lines[i].trim()) buf2.push(lines[i++].replace(/^>\s?/, ""));
        out.push("<blockquote>" + lines2html(buf2.join("\n").replace(/^\n+|\n+$/g, "")) + "</blockquote>");
        continue;
      }
      var kind = UL_RE.test(line) ? "ul" : OL_RE.test(line) ? "ol" : null;
      if (kind) {                                                           // list: items, with indented continuation lines
        var re = kind === "ul" ? UL_RE : OL_RE, items = [];
        while (i < lines.length && lines[i].trim()) {
          if (re.test(lines[i])) items.push(lines[i].replace(re, "").trim());
          else if (/^\s{2,}\S/.test(lines[i]) && items.length) items[items.length - 1] += "\n" + lines[i].trim();
          else break;
          i++;
        }
        out.push("<" + kind + ">" + items.map(function (t) { return "<li>" + lines2html(t) + "</li>"; }).join("") + "</" + kind + ">");
        continue;
      }
      while (i < lines.length && lines[i].trim()) buf2.push(lines[i++]);   // paragraph
      out.push("<p>" + lines2html(buf2.join("\n").replace(/^\n+|\n+$/g, "")) + "</p>");
    }
    return out.join("");
  }
  RP.esc = esc;
  RP.md = md;

  /* ── posts manifest ── */
  RP.sortPosts = function (list) {
    return list.slice().sort(function (a, b) {
      var ad = String(a.date || ""), bd = String(b.date || "");
      if (ad !== bd) return ad < bd ? 1 : -1;
      var at = String(a.publishAt || ""), bt = String(b.publishAt || "");
      if (at !== bt) return at < bt ? 1 : -1;
      return String(a.title).localeCompare(String(b.title));
    });
  };
  function nowMs(now) { return now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.now(); }
  function hasWhen(e) { return !!e && e.publishAt != null && e.publishAt !== ""; }
  // Not yet due: a go-live time that is still in the future (or can't be read, which is treated the same way).
  RP.isScheduled = function (e, now) { return hasWhen(e) && !(Date.parse(e.publishAt) <= nowMs(now)); };
  // Shown in public lists: public, and either no go-live time or one that has passed.
  RP.isLive = function (e, now) {
    if (!e) return false;
    var vis = e.visibility == null ? "public" : e.visibility;
    return vis === "public" && !RP.isScheduled(e, now);
  };
  // Raw manifest: the validated array exactly as stored in posts/index.json.
  RP.fetchManifest = function () {
    return fetch("posts/index.json", { cache: "no-cache" }).then(function (r) {
      if (!r.ok) { var e = new Error("posts/index.json returned " + r.status); e.status = r.status; throw e; }
      return r.json();
    }).then(function (data) {
      if (!Array.isArray(data)) throw new Error("posts/index.json should be a list of posts");
      return data;
    });
  };
  function str(v) { return typeof v === "string" ? v : ""; }
  // Clean, sorted (newest first) posts ready for display, every visibility included. Entries that can't be shown are skipped.
  // Public lists should filter with RP.isLive.
  RP.loadPosts = function () {
    return RP.fetchManifest().then(function (data) {
      var list = [];
      data.forEach(function (e) {
        if (!e || typeof e !== "object") return;
        if (typeof e.slug !== "string" || !SLUG_RE.test(e.slug)) return;
        if (typeof e.title !== "string" || !e.title.trim()) return;
        if (typeof e.date !== "string" || !DATE_RE.test(e.date)) return;
        list.push({
          slug: e.slug,
          title: e.title.trim(),
          subtitle: str(e.subtitle).trim(),
          date: e.date,
          updated: typeof e.updated === "string" && DATE_RE.test(e.updated) ? e.updated : "",
          publishAt: hasWhen(e) ? String(e.publishAt) : "",
          visibility: e.visibility === "unlisted" ? "unlisted" : (e.visibility == null || e.visibility === "public" ? "public" : "private"),
          tags: Array.isArray(e.tags) ? e.tags.filter(function (t) { return typeof t === "string" && t.trim(); }).map(function (t) { return t.trim(); }) : [],
          summary: str(e.summary),
          words: Number(e.words) > 0 ? Number(e.words) : 0,
          dropCap: e.dropCap === true,
          image: str(e.image),
          displayTitle: str(e.displayTitle).trim(),
          displaySubtitle: str(e.displaySubtitle).trim(),
          id: str(e.id),
          canonical: str(e.canonical)
        });
      });
      return RP.sortPosts(list);
    });
  };
  // The posts anyone can see right now.
  RP.loadLivePosts = function () {
    return RP.loadPosts().then(function (list) {
      var now = Date.now();
      return list.filter(function (p) { return RP.isLive(p, now); });
    });
  };

  /* ── theme ── */
  function setTheme(t) {
    t = t === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = t;
    var other = t === "dark" ? "light" : "dark", btn = $("theme-btn");
    if (btn) {   // the visible word comes from CSS (data-theme), so it is right before this runs
      btn.setAttribute("aria-label", "Switch to " + other + " mode");
    }
    RP.store.set("rp:theme", t);
  }
  setTheme(RP.store.get("rp:theme"));
  (function () {
    var btn = $("theme-btn");
    if (btn) btn.addEventListener("click", function () {
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
  })();

  /* ── status bar: active tab, stories tab (owner only) ── */
  (function () {
    var page = document.body.getAttribute("data-page");
    Array.prototype.forEach.call(document.querySelectorAll("[data-nav]"), function (a) {
      if (a.getAttribute("data-nav") === page) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var w = $("nav-stories");
    if (w && RP.isOwner) w.hidden = false;
  })();

  /* ── KL clock: one shared interval; pages can subscribe with RP.onTick ── */
  var fTime = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
  var fDate = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  function parts(f, d) { var o = {}; f.formatToParts(d).forEach(function (p) { o[p.type] = p.value; }); return o; }
  var listeners = [];
  function now() {
    var d = new Date(), t = parts(fTime, d), dt = parts(fDate, d);
    return {
      hour: t.hour, minute: t.minute, second: t.second, period: (t.dayPeriod || "").toUpperCase(),
      weekday: dt.weekday, day: dt.day, month: dt.month
    };
  }
  function tick() {
    var t = now(), bt = $("bar-time");
    if (bt) bt.textContent = t.hour + ":" + t.minute + " " + t.period;
    listeners.forEach(function (fn) { fn(t); });
  }
  RP.onTick = function (fn) { listeners.push(fn); fn(now()); };
  tick();
  setInterval(tick, 1000);

  /* ── weather: one Open-Meteo request per page, shared as a promise (never rejects) ── */
  function barWeather(text) { var b = $("bar-wx"); if (b) b.textContent = text; }
  RP.weather = new Promise(function (resolve) {
    var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 8000);
    fetch("https://api.open-meteo.com/v1/forecast?latitude=3.1390&longitude=101.6869&current_weather=true", { signal: ctl.signal })
      .then(function (r) { if (!r.ok) throw new Error("weather " + r.status); return r.json(); })
      .then(function (d) {
        var c = d && d.current_weather;
        if (!c || typeof c.temperature !== "number") throw new Error("weather data missing");
        resolve({
          ok: true,
          temp: Math.round(c.temperature),
          wind: Math.round(Number(c.windspeed) || 0),
          code: Number(c.weathercode),
          day: c.is_day === 1
        });
      })
      .catch(function () { resolve({ ok: false }); })
      .then(function () { clearTimeout(timer); });
  }).then(function (w) {
    barWeather(w.ok ? "KL " + w.temp + "°C" : "KL —");
    return w;
  });
})();
