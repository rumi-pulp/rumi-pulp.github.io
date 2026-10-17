/* rumi-pulp — post reader */
(function () {
  "use strict";
  var RP = window.RP, $ = RP.$, el = RP.el;
  var nav = {};

  function postUrl(slug) { return "post.html?slug=" + encodeURIComponent(slug); }

  function setMessage(title, docTitle, text, link) {
    $("post-meta").textContent = "";
    $("post-title").textContent = title;
    $("post-sub").textContent = "";
    var body = $("post-body");
    body.textContent = "";
    var p = el("p", null, text + (link ? " " : ""));
    if (link) {
      var a = el("a", null, link.text);
      a.href = link.href;
      p.appendChild(a);
    }
    body.appendChild(p);
    $("post-after").hidden = true;
    $("post-foot").hidden = true;
    document.title = docTitle + " — rumi-pulp";
  }
  function notFound() {
    setMessage("Post not found", "Not found", "This post doesn't exist (or was renamed).", { text: "Back to all posts", href: "blog.html" });
  }
  function notYet() {
    setMessage("Not published yet", "Not published yet", "This post isn't published yet.", { text: "Back to all posts", href: "blog.html" });
  }
  function loadError() {
    setMessage("Couldn't load this post", "Error", "Something went wrong while loading it. Check your connection and try again.", { text: "Try again", href: location.href });
  }
  function setMeta(name, content) {
    var m = document.querySelector('meta[name="' + name + '"]');
    if (!m) { m = document.createElement("meta"); m.name = name; document.head.appendChild(m); }
    m.content = content;
  }

  function relatedItem(p) {
    var li = el("li"), a = el("a");
    a.href = postUrl(p.slug);
    var box = el("span");
    box.appendChild(el("span", "t", p.title));
    if (p.subtitle || p.summary) box.appendChild(el("span", "ex", p.subtitle || p.summary));
    var meta = [RP.niceDate(p.date), RP.readTime(p.words) + " min read"];
    if (p.tags.length) meta.push(p.tags.join(", "));
    box.appendChild(el("span", "meta", meta.join(" · ")));
    a.appendChild(box);
    li.appendChild(a);
    return li;
  }

  // Up to three other public posts: ones sharing a topic first (most shared, then newest), then the newest of the rest.
  function showRelated(p, live) {
    var others = live.filter(function (x) { return x.slug !== p.slug; });
    if (!others.length) return;
    function shared(x) { return x.tags.filter(function (t) { return p.tags.indexOf(t) >= 0; }); }
    var same = others.filter(function (x) { return shared(x).length; });
    same.sort(function (a, b) { return shared(b).length - shared(a).length; });   // stable: ties stay newest first
    var picks = same.concat(others.filter(function (x) { return same.indexOf(x) < 0; })).slice(0, 3);
    var topic = null;
    if (same.length) topic = p.tags.filter(function (t) { return shared(same[0]).indexOf(t) >= 0; })[0] || null;
    $("more-h").textContent = topic ? "more on " + topic : "more to read";
    var ul = $("related");
    ul.textContent = "";
    picks.forEach(function (x) { ul.appendChild(relatedItem(x)); });
    $("related-wrap").hidden = false;
  }

  function render(p, text, live, preview) {
    var meta = [RP.niceDate(p.date), RP.readTime(RP.countWords(text)) + " min read"];
    if (p.tags.length) meta.push(p.tags.join(", "));
    $("post-meta").textContent = meta.join(" · ");
    $("post-title").textContent = p.title;
    $("post-sub").textContent = p.subtitle;
    var body = $("post-body");
    body.innerHTML = RP.md(text);
    if (p.dropCap) {
      var first = body.querySelector(":scope > p");
      if (first) first.classList.add("mk-drop");
    }
    if (preview) {
      var note = el("p", "notice", "Preview only: this post goes live " + (RP.klLabel(p.publishAt) || "later") + ". It isn't shown on the blog yet.");
      body.insertBefore(note, body.firstChild);
    }
    var title = p.displayTitle || p.title, desc = p.displaySubtitle || p.subtitle || p.summary;
    document.title = title + " — rumi-pulp";
    if (desc) setMeta("description", desc);
    if (p.visibility === "unlisted" || preview) setMeta("robots", "noindex");

    $("post-after").hidden = false;
    showRelated(p, live);

    var idx = live.findIndex(function (x) { return x.slug === p.slug; });
    var older = idx >= 0 ? live[idx + 1] : null, newer = idx > 0 ? live[idx - 1] : null;
    nav = { older: older, newer: newer };
    [["prev-wrap", older, "← Older"], ["next-wrap", newer, "Newer →"]].forEach(function (x) {
      var w = $(x[0]);
      w.textContent = "";
      if (!x[1]) return;
      var a = el("a");
      a.href = postUrl(x[1].slug);
      a.appendChild(el("span", "lbl", x[2]));
      a.appendChild(el("span", "pt", x[1].title));
      w.appendChild(a);
    });
    $("post-foot").hidden = !(older || newer);

    $("copy-link").onclick = function () {
      var m = $("copy-msg"), url = RP.SITE + "posts/" + p.slug + ".html";
      var fail = "Couldn't copy automatically. The link is " + url;
      if (!navigator.clipboard || !navigator.clipboard.writeText) { m.textContent = fail; return; }
      navigator.clipboard.writeText(url).then(function () { m.textContent = "Link copied."; }, function () { m.textContent = fail; });
    };
    updateProgress();
  }

  /* ── reading progress: scroll-linked, no animation ── */
  var bar = $("progress-i");
  function updateProgress() {
    var art = $("article");
    if (!bar || !art) return;
    var top = art.getBoundingClientRect().top + window.scrollY - 40;
    var total = art.offsetHeight - window.innerHeight * 0.6;
    var p = total > 0 ? Math.min(1, Math.max(0, (window.scrollY - top) / total)) : 1;
    bar.style.transform = "scaleX(" + p.toFixed(4) + ")";
  }
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);

  var params = new URLSearchParams(location.search), slug = params.get("slug") || "";
  if (!RP.SLUG_RE.test(slug)) {
    notFound();
  } else {
    RP.loadPosts().then(function (all) {
      var now = Date.now(), p = all.filter(function (x) { return x.slug === slug; })[0];
      if (!p) { notFound(); return; }
      var preview = false;
      if (RP.isScheduled(p, now)) {
        if (!(RP.isOwner && params.get("preview") === "1")) { notYet(); return; }   // only Rumi, on her own computer, can read it early
        preview = true;
      }
      var live = all.filter(function (x) { return RP.isLive(x, now); });
      return fetch("posts/" + slug + ".md", { cache: "no-cache" }).then(function (r) {
        if (r.status === 404) { notFound(); return; }
        if (!r.ok) throw new Error("post returned " + r.status);
        return r.text().then(function (text) { render(p, text, live, preview); });
      });
    }).catch(loadError);
  }

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    if (e.key === "ArrowLeft" && nav.older) location.href = postUrl(nav.older.slug);
    if (e.key === "ArrowRight" && nav.newer) location.href = postUrl(nav.newer.slug);
  });
})();
