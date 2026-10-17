/* rumi-pulp — post reader */
(function () {
  "use strict";
  var RP = window.RP, $ = RP.$, el = RP.el;
  var nav = {};

  function postUrl(slug) { return "post.html?slug=" + encodeURIComponent(slug); }

  function setMessage(title, docTitle, text, link) {
    $("post-meta").textContent = "";
    $("post-title").textContent = title;
    var body = $("post-body");
    body.textContent = "";
    var p = el("p", null, text + (link ? " " : ""));
    if (link) {
      var a = el("a", null, link.text);
      a.href = link.href;
      p.appendChild(a);
    }
    body.appendChild(p);
    $("post-foot").hidden = true;
    document.title = docTitle + " — rumi-pulp";
  }
  function notFound() {
    setMessage("Post not found", "Not found", "This post doesn't exist (or was renamed).", { text: "Back to all posts", href: "blog.html" });
  }
  function loadError() {
    setMessage("Couldn't load this post", "Error", "Something went wrong while loading it. Check your connection and try again.", { text: "Try again", href: location.href });
  }

  function render(posts, idx, text) {
    var p = posts[idx];
    var meta = [RP.niceDate(p.date), RP.readTime(RP.countWords(text)) + " min read"];
    if (p.tags.length) meta.push(p.tags.join(", "));
    $("post-meta").textContent = meta.join(" · ");
    $("post-title").textContent = p.title;
    $("post-body").innerHTML = RP.md(text);
    var older = posts[idx + 1], newer = posts[idx - 1];
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
    document.title = p.title + " — rumi-pulp";
  }

  var slug = new URLSearchParams(location.search).get("slug") || "";
  if (!RP.SLUG_RE.test(slug)) {
    notFound();
  } else {
    var posts = null;
    RP.loadPosts().then(function (list) {
      posts = list;
      var idx = list.findIndex(function (p) { return p.slug === slug; });
      if (idx < 0) { notFound(); return; }
      return fetch("posts/" + slug + ".md", { cache: "no-cache" }).then(function (r) {
        if (r.status === 404) { notFound(); return; }
        if (!r.ok) throw new Error("post returned " + r.status);
        return r.text().then(function (text) { render(list, idx, text); });
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
