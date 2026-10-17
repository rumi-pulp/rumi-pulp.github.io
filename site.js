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
  RP.todayKL = function () {
    var o = {};
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).forEach(function (p) { o[p.type] = p.value; });
    return o.year + "-" + o.month + "-" + o.day;
  };

  /* ── markdown: escape first, then add a few tags. Links are http/https only. ── */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function emphasis(s) {
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  }
  // Code spans and links become placeholder tokens first, so emphasis can't reach inside code or URLs.
  function inline(s) {
    var tokens = [];
    function keep(html) { tokens.push(html); return "\u0000" + (tokens.length - 1) + "\u0000"; }
    s = esc(s).replace(/\u0000/g, "");
    s = s.replace(/`([^`]+)`/g, function (_, c) { return keep("<code>" + c + "</code>"); });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function (_, text, url) {
      return keep('<a href="' + url + '" target="_blank" rel="noopener">' + emphasis(text) + "</a>");
    });
    s = emphasis(s);
    while (/\u0000\d+\u0000/.test(s)) s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return tokens[+i]; });
    return s;
  }
  function md(src) {
    return String(src).replace(/\r/g, "").split(/\n{2,}/).filter(function (b) { return b.trim(); }).map(function (b) {
      b = b.replace(/^\n+|\n+$/g, "");
      if (/^#{1,3}\s+/.test(b)) return "<h2>" + inline(b.replace(/^#{1,3}\s+/, "")) + "</h2>";
      if (/^>\s?/.test(b)) return "<blockquote>" + inline(b.replace(/^>\s?/gm, "")).replace(/\n/g, "<br>") + "</blockquote>";
      return "<p>" + inline(b).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }
  RP.esc = esc;
  RP.md = md;

  /* ── posts manifest ── */
  RP.sortPosts = function (list) {
    return list.slice().sort(function (a, b) {
      var ad = String(a.date || ""), bd = String(b.date || "");
      if (ad !== bd) return ad < bd ? 1 : -1;
      return String(a.title).localeCompare(String(b.title));
    });
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
  // Clean, sorted (newest first) posts ready for display. Entries that can't be shown are skipped.
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
          date: e.date,
          tags: Array.isArray(e.tags) ? e.tags.filter(function (t) { return typeof t === "string" && t.trim(); }).map(function (t) { return t.trim(); }) : [],
          summary: typeof e.summary === "string" ? e.summary : "",
          words: Number(e.words) > 0 ? Number(e.words) : 0
        });
      });
      return RP.sortPosts(list);
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

  /* ── status bar: active tab, write tab ── */
  (function () {
    var page = document.body.getAttribute("data-page");
    Array.prototype.forEach.call(document.querySelectorAll("[data-nav]"), function (a) {
      if (a.getAttribute("data-nav") === page) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var w = $("nav-write");
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
