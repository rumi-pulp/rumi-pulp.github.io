/* rumi-pulp — home page */
(function () {
  "use strict";
  var RP = window.RP, $ = RP.$, el = RP.el;

  /* ── gentle entrance, once per visit (the head script decides and adds .booting) ── */
  var root = document.documentElement;
  if (root.classList.contains("booting")) {
    var items = Array.prototype.slice.call(document.querySelectorAll(".boot")), i = 0;
    var timer = setInterval(function () {
      if (i >= items.length) { clearInterval(timer); root.classList.remove("booting"); return; }
      items[i++].classList.add("on");
    }, 90);
  }

  /* ── latest posts ── */
  function postItem(p) {
    var li = el("li"), a = el("a");
    a.href = "post.html?slug=" + encodeURIComponent(p.slug);
    var box = el("span");
    box.appendChild(el("span", "t", p.title));
    if (p.summary) box.appendChild(el("span", "ex", p.summary));
    var meta = [RP.niceDate(p.date), RP.readTime(p.words) + " min read"];
    if (p.tags.length) meta.push(p.tags.join(", "));
    box.appendChild(el("span", "meta", meta.join(" · ")));
    a.appendChild(box);
    li.appendChild(a);
    return li;
  }
  (function () {
    var list = $("home-latest"), more = $("home-more");
    function note(text) { list.textContent = ""; list.appendChild(el("li", "empty", text)); more.hidden = true; }
    RP.loadPosts().then(function (posts) {
      if (!posts.length) { note("Nothing published yet — the first post is on its way."); return; }
      list.textContent = "";
      posts.slice(0, 3).forEach(function (p) { list.appendChild(postItem(p)); });
      more.hidden = false;
    }).catch(function () { note("Couldn't load posts right now."); });
  })();

  /* ── now: clock ── */
  RP.onTick(function (t) {
    $("clk-hm").textContent = t.hour + ":" + t.minute;
    $("clk-s").textContent = ":" + t.second;
    $("clk-p").textContent = t.period;
    $("clk-date").textContent = t.weekday + ", " + t.day + " " + t.month + " · Kuala Lumpur, GMT+8";
  });

  /* ── now: weather (ASCII art: 5 lines, ASCII only, padded to 13 columns) ── */
  function art(lines) { return lines.map(function (l) { return (l + "             ").slice(0, 13); }).join("\n"); }
  var ART = {
    sun: art(["    \\   /", "     .-.", "  - (   ) -", "     `-'", "    /   \\"]),
    moon: art(["     .--.", "   .'  .'", "  /   /", "  \\   '.__.", "   '._____.'"]),
    partly: art(["  \\  /", "_ /\"\".-.", "  \\_(   ).", "  /(___(__)", ""]),
    cloud: art(["", "     .--.", "  .-(    ).", " (___.__)__)", ""]),
    fog: art(["", " _ - _ - _ -", "  _ - _ - _", " _ - _ - _ -", ""]),
    rain: art(["     .--.", "  .-(    ).", " (___.__)__)", "  ' ' ' '", " ' ' ' '"]),
    thunder: art(["     .--.", "  .-(    ).", " (___.__)__)", "    /_  /_", "     /   /"])
  };
  function wxInfo(code, day) {
    if (code === 0) return day ? { art: ART.sun, words: "clear sky" } : { art: ART.moon, words: "clear night" };
    if (code === 1 || code === 2) return { art: day ? ART.partly : ART.cloud, words: "partly cloudy" };
    if (code === 3) return { art: ART.cloud, words: "overcast" };
    if (code === 45 || code === 48) return { art: ART.fog, words: "fog" };
    if (code >= 51 && code <= 57) return { art: ART.rain, words: "drizzle" };
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { art: ART.rain, words: (code === 65 || code === 67 || code === 82) ? "heavy rain" : "rain" };
    if (code >= 95 && code <= 99) return { art: ART.thunder, words: "thunderstorm" };
    return { art: ART.cloud, words: "cloudy" };
  }
  RP.weather.then(function (w) {
    var a = $("wx-art"), tp = $("wx-temp"), cd = $("wx-cond"), wd = $("wx-wind");
    if (w.ok) {
      var info = wxInfo(w.code, w.day);
      a.hidden = false; a.textContent = info.art;
      tp.textContent = w.temp + "°C"; cd.textContent = info.words;
      wd.hidden = false; wd.textContent = "wind " + w.wind + " km/h";
    } else {
      a.hidden = true; a.textContent = "";
      tp.textContent = ""; cd.textContent = "weather unavailable"; wd.hidden = true;
    }
  });

  /* ── about + playlist ── */
  $("about-btn").addEventListener("click", function () {
    var open = $("about-full").hidden;
    $("about-full").hidden = !open;
    this.setAttribute("aria-expanded", String(open));
    this.textContent = open ? "Show less" : "Read more";
  });
  $("play-btn").addEventListener("click", function () {
    var slot = $("player-slot"), open = !slot.firstChild;
    slot.textContent = "";
    if (open) {
      var w = el("div", "player"), f = document.createElement("iframe");
      f.title = "Spotify playlist"; f.loading = "lazy";
      f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
      f.src = "https://open.spotify.com/embed/playlist/38u7cDibJ7b9sVd3iIWgdu?utm_source=generator&theme=" + (document.documentElement.dataset.theme === "dark" ? "0" : "1");
      w.appendChild(f);
      slot.appendChild(w);
    }
    this.setAttribute("aria-expanded", String(open));
    this.textContent = open ? "Hide playlist" : "Play my playlist";
  });
})();
