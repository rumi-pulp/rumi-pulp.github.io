/* rumi-pulp — blog list */
(function () {
  "use strict";
  var RP = window.RP, $ = RP.$, el = RP.el;
  var POSTS = [], activeTag = null;

  function postItem(p) {
    var li = el("li"), a = el("a");
    a.href = "post.html?slug=" + encodeURIComponent(p.slug);
    a.appendChild(el("span", "date", RP.niceDate(p.date)));
    var box = el("span");
    box.appendChild(el("span", "t", p.title));
    if (p.subtitle || p.summary) box.appendChild(el("span", "ex", p.subtitle || p.summary));
    var meta = [RP.readTime(p.words) + " min read"];
    if (p.tags.length) meta.push(p.tags.join(", "));
    box.appendChild(el("span", "meta", meta.join(" · ")));
    a.appendChild(box);
    li.appendChild(a);
    return li;
  }

  function draw() {
    var q = $("search-in").value.trim().toLowerCase();
    Array.prototype.forEach.call($("tag-filter").children, function (b) {
      b.setAttribute("aria-pressed", String(b.textContent === activeTag));
    });
    var list = $("listing");
    list.textContent = "";
    var hits = POSTS.filter(function (p) {
      var hay = (p.title + " " + p.subtitle + " " + p.tags.join(" ") + " " + p.summary).toLowerCase();
      return (!q || hay.indexOf(q) >= 0) && (!activeTag || p.tags.indexOf(activeTag) >= 0);
    });
    hits.forEach(function (p) { list.appendChild(postItem(p)); });
    if (!hits.length) {
      list.appendChild(el("li", "empty", "No posts match" + (q ? " \"" + $("search-in").value.trim() + "\"" : "") + (activeTag ? " in " + activeTag : "") + ". Try a different word."));
    }
    var n = POSTS.length, noun = n === 1 ? " post" : " posts";
    $("listing-count").textContent = hits.length === n ? n + noun : hits.length + " of " + n + noun;
  }

  function note(text) {
    $("listing").textContent = "";
    $("listing").appendChild(el("li", "empty", text));
    $("listing-count").textContent = "";
  }

  RP.loadLivePosts().then(function (posts) {
    POSTS = posts;
    if (!POSTS.length) { note("Nothing published yet."); return; }
    var tags = [];
    POSTS.forEach(function (p) { p.tags.forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); });
    tags.sort();
    tags.forEach(function (t) {
      var b = el("button", null, t);
      b.type = "button";
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { activeTag = activeTag === t ? null : t; draw(); });
      $("tag-filter").appendChild(b);
    });
    $("tools").hidden = false;
    $("search-in").addEventListener("input", draw);
    draw();
  }).catch(function () { note("Couldn't load posts right now."); });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    if ($("tools").hidden) return;
    e.preventDefault();
    $("search-in").focus();
  });
})();
