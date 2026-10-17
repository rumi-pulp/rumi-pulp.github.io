/* rumi-pulp — the story model shared by the writing desk: what the editor may contain, how it becomes markdown,
   and how markdown (or a saved draft) becomes editor content again.
   Everything goes through cleanBlocks(), which rebuilds the content from a whitelist of tags. */
(function () {
  "use strict";
  var RP = window.RP, el = RP.el;
  var RPB = (window.RPB = {});

  var NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,78}\.(?:jpe?g|png|webp|gif)$/i;
  var UNS_RE = /^https:\/\/images\.unsplash\.com\/[A-Za-z0-9._~:\/?#@!$&*+,;=%-]*$/;
  var URL_RE = /^https?:\/\/[^\s]+$/i;
  var SKIP = /^(SCRIPT|STYLE|IFRAME|IMG|SVG|OBJECT|EMBED|VIDEO|AUDIO|CANVAS|TEMPLATE|NOSCRIPT|TEXTAREA|INPUT|BUTTON|SELECT|FORM|LINK|META)$/;
  var BLOCKISH = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|PRE|FIGURE|HR|SECTION|ARTICLE)$/;
  RPB.NAME_RE = NAME_RE;
  RPB.URL_RE = URL_RE;

  var keepMode = false;   // true while cleanBlocks runs with { keep: true }: the editor's undo snapshots keep spaces and empty quote lines exactly
  function br() { return document.createElement("br"); }
  function txt(s) { return document.createTextNode(s); }
  function each(list, fn) { Array.prototype.slice.call(list).forEach(fn); }
  function isBlank(n) { return !n.textContent.trim() && !n.querySelector("figure, img"); }

  /* ── building blocks ── */
  RPB.para = function (text) {
    var p = el("p");
    if (text) p.textContent = text; else p.appendChild(br());
    return p;
  };
  RPB.stars = function () {
    var d = el("div", "mk-stars"), s = el("span", null, "* * *");
    d.setAttribute("role", "separator"); d.setAttribute("aria-label", "section break"); s.setAttribute("aria-hidden", "true");
    d.contentEditable = "false"; d.tabIndex = 0;   // focusable: click it (or Tab to it), then Backspace or Delete removes it
    d.appendChild(s);
    return d;
  };
  RPB.codeBlock = function (text) {
    var pre = el("pre", "mk-code");
    pre.setAttribute("data-placeholder", "// type or paste code here");
    String(text || "").split("\n").forEach(function (line, i) {
      if (i) pre.appendChild(br());
      if (line) pre.appendChild(txt(line));
    });
    return pre;
  };
  RPB.videoCard = function (v) {
    var n = el("div", "mk-embed"); n.contentEditable = "false"; n.tabIndex = 0;
    n.setAttribute("role", "group"); n.setAttribute("aria-label", "Video. Press Delete to remove it.");
    n.setAttribute("data-kind", "video"); n.setAttribute("data-url", v.canonical);
    var sc = el("div", "screen"); sc.appendChild(el("div", "tri")); n.appendChild(sc);
    var cap = el("div", "cap");
    cap.appendChild(el("b", null, v.label + " video"));
    cap.appendChild(el("div", null, v.canonical));
    cap.appendChild(el("div", null, "The video plays on the published page."));
    n.appendChild(cap);
    return n;
  };
  RPB.linkCard = function (u) {
    var url;
    try { url = new URL(u); } catch (e) { return null; }
    if (!URL_RE.test(u)) return null;
    var n = el("div", "mk-embed"); n.contentEditable = "false"; n.tabIndex = 0;
    n.setAttribute("role", "group"); n.setAttribute("aria-label", "Link card. Press Delete to remove it.");
    n.setAttribute("data-kind", "link"); n.setAttribute("data-url", u);
    var cap = el("div", "cap solo");
    cap.appendChild(el("b", null, url.hostname));
    cap.appendChild(el("div", null, u.length > 80 ? u.slice(0, 77) + "…" : u));
    cap.appendChild(el("div", null, "Shown as a link on the published page."));
    n.appendChild(cap);
    return n;
  };
  // opts: name (a picture stored with the draft) | remote (an Unsplash address), alt, size, path (md-origin), caption (an element or a string), save
  RPB.makeFigure = function (o) {
    var size = o.size === "wide" || o.size === "full" ? o.size : "normal";
    var f = el("figure", "mk-fig" + (size === "normal" ? "" : " " + size));
    f.contentEditable = "false"; f.tabIndex = 0; f.dataset.size = size; f.dataset.alt = o.alt || "";
    f.setAttribute("role", "group"); f.setAttribute("aria-label", "Image. Press Enter to change its size or description.");
    if (o.name) f.dataset.name = o.name;
    if (o.remote) f.dataset.remote = o.remote;
    if (o.path) f.dataset.path = o.path;
    if (o.creditName && o.creditUrl) { f.dataset.creditName = o.creditName; f.dataset.creditUrl = o.creditUrl; }
    var img = el("img");
    img.alt = o.alt || "";
    if (o.remote) img.src = o.remote;
    f.appendChild(img);
    var c = el("figcaption"); c.contentEditable = "true"; c.setAttribute("data-placeholder", "Add a caption (optional)");
    if (typeof o.caption === "string") { if (o.caption) c.textContent = o.caption; }
    else if (o.caption) { inlineInto(o.caption, c, {}); mergeAdjacent(c); }
    f.appendChild(c);
    return f;
  };

  /* ── cleaning: rebuild content from a whitelist ── */
  function safeHref(a) {
    var h = a.getAttribute("href") || "";
    return URL_RE.test(h) ? h : "";
  }
  function inlineInto(src, dst, ctx) {
    each(src.childNodes, function (n) {
      if (n.nodeType === 3) { dst.appendChild(txt((keepMode ? n.nodeValue : n.nodeValue.replace(/\u00a0/g, " ")).replace(/[\u0000\u200b]/g, ""))); return; }
      if (n.nodeType !== 1) return;
      var tag = n.nodeName, w;
      if (tag === "BR") { dst.appendChild(br()); return; }
      if (SKIP.test(tag)) return;
      if ((tag === "STRONG" || tag === "B") && !ctx.strong) { w = el("strong"); inlineInto(n, w, Object.assign({}, ctx, { strong: true })); }
      else if ((tag === "EM" || tag === "I") && !ctx.em) { w = el("em"); inlineInto(n, w, Object.assign({}, ctx, { em: true })); }
      else if (tag === "CODE" && !ctx.code) { w = el("code"); w.textContent = n.textContent.replace(/\u00a0/g, " "); }
      else if (tag === "A" && !ctx.a && safeHref(n)) {
        w = el("a"); w.setAttribute("href", safeHref(n)); w.target = "_blank"; w.rel = "noopener";
        inlineInto(n, w, Object.assign({}, ctx, { a: true }));
      }
      else if (tag === "SPAN" && n.classList.contains("mk-note") && /^n\d+$/.test(n.getAttribute("data-note-id") || "") && !ctx.note) {
        w = el("span", "mk-note"); w.setAttribute("data-note-id", n.getAttribute("data-note-id"));
        inlineInto(n, w, Object.assign({}, ctx, { note: true }));
      }
      else { inlineInto(n, dst, ctx); return; }   // anything else: keep its content, drop the tag
      if (w.childNodes.length) dst.appendChild(w);
    });
  }
  // <strong>a</strong><strong>b</strong> becomes <strong>ab</strong> (same for em)
  function mergeAdjacent(parent) {
    var n = parent.firstChild;
    while (n) {
      var nx = n.nextSibling;
      if (n.nodeType === 1 && (n.nodeName === "STRONG" || n.nodeName === "EM") && nx && nx.nodeType === 1 && nx.nodeName === n.nodeName) {
        while (nx.firstChild) n.appendChild(nx.firstChild);
        nx.remove();
        continue;
      }
      if (n.nodeType === 1) mergeAdjacent(n);
      n = nx;
    }
    parent.normalize();
  }
  function inlineBlock(tag, src) {
    var b = el(tag);
    inlineInto(src, b, {});
    mergeAdjacent(b);
    return b;
  }
  function hasBlockChild(n) {
    return Array.prototype.some.call(n.childNodes, function (c) { return c.nodeType === 1 && BLOCKISH.test(c.nodeName); });
  }
  function codeText(n) {
    var s = "";
    (function walk(x) {
      each(x.childNodes, function (c) {
        if (c.nodeType === 3) s += c.nodeValue;
        else if (c.nodeName === "BR") s += "\n";
        else if (c.nodeType === 1 && !SKIP.test(c.nodeName)) {
          if (/^(DIV|P)$/.test(c.nodeName) && s && !/\n$/.test(s)) s += "\n";
          walk(c);
        }
      });
    })(n);
    return s.replace(/[\u00a0]/g, " ").replace(/\u0000/g, "").replace(/\n+$/, "");
  }
  function figureFrom(n) {
    var img = n.querySelector("img"), cap = n.querySelector("figcaption");
    var name = n.getAttribute("data-name") || "", remote = n.getAttribute("data-remote") || "", path = n.getAttribute("data-path") || "";
    if (!name && !remote && img) {     // a picture rendered by RP.md
      var src = img.getAttribute("src") || "";
      if (/^posts\/images\//.test(src)) { path = src.slice(6); name = path.split("/").pop(); }
      else if (UNS_RE.test(src)) remote = src;
    }
    if (name && !NAME_RE.test(name)) return null;
    if (remote && !UNS_RE.test(remote)) return null;
    if (!name && !remote) return null;
    if (!RP.IMG_REL.test(path)) path = "";
    var size = n.getAttribute("data-size");
    if (size !== "wide" && size !== "full" && size !== "normal") size = n.classList.contains("wide") ? "wide" : n.classList.contains("full") ? "full" : "normal";
    var alt = n.hasAttribute("data-alt") ? n.getAttribute("data-alt") : (img ? img.getAttribute("alt") || "" : "");
    // who to credit for an Unsplash photo (kept so the credit can be put back if it is edited away)
    var cn = n.getAttribute("data-credit-name") || "", cu = n.getAttribute("data-credit-url") || "";
    if (remote && !cn && cap) {
      var a1 = Array.prototype.filter.call(cap.querySelectorAll("a"), function (a) { return /^https:\/\/unsplash\.com\/@/.test(a.getAttribute("href") || ""); })[0];
      if (a1) { cn = a1.textContent.trim(); cu = a1.getAttribute("href"); }
    }
    if (!remote || !cn || cn.length > 80 || !/^https:\/\/unsplash\.com\/[^\s"<>]*$/.test(cu)) { cn = ""; cu = ""; }
    else cu = cu.replace(/[?&]utm_[^#]*$/, "");
    return RPB.makeFigure({ name: name, remote: remote, path: path, alt: alt.replace(/\s+/g, " ").slice(0, 200), size: size, caption: cap, creditName: cn, creditUrl: cu });
  }
  function blockInto(n, out, opts) {
    var tag = n.nodeName, b;
    if (n.nodeType === 3) {
      if (n.nodeValue.trim()) { b = RPB.para(); b.textContent = keepMode ? n.nodeValue : n.nodeValue.replace(/\u00a0/g, " "); out.appendChild(b); }
      return;
    }
    if (n.nodeType !== 1 || SKIP.test(tag)) return;
    var cls = n.classList;
    if (tag === "FIGURE") { b = figureFrom(n); if (b) out.appendChild(b); return; }
    if (tag === "HR" || cls.contains("mk-stars")) { out.appendChild(RPB.stars()); return; }
    if (cls.contains("mk-video") || (cls.contains("mk-embed") && n.getAttribute("data-kind") === "video")) {
      var v = RP.parseVideo(n.getAttribute("data-url") || "");
      if (v) out.appendChild(RPB.videoCard(v));
      return;
    }
    if (cls.contains("mk-embed")) {
      var u = n.getAttribute("data-url") || "";
      b = URL_RE.test(u) ? RPB.linkCard(u) : null;
      if (b) out.appendChild(b);
      return;
    }
    if (tag === "H1" || tag === "H2") { b = inlineBlock("h2", n); if (!b.firstChild && keepMode) b.appendChild(br()); if (b.firstChild) out.appendChild(b); return; }
    if (/^H[3-6]$/.test(tag)) { b = inlineBlock("h3", n); if (!b.firstChild && keepMode) b.appendChild(br()); if (b.firstChild) out.appendChild(b); return; }
    if (tag === "PRE") {
      out.appendChild(RPB.codeBlock(codeText(n)));
      return;
    }
    if (tag === "UL" || tag === "OL") {
      b = el(tag.toLowerCase());
      (function items(list) {
        each(list.children, function (li) {
          if (li.nodeName === "UL" || li.nodeName === "OL") { items(li); return; }
          if (li.nodeName !== "LI") return;
          var item = el("li"), nested = [];
          each(li.childNodes, function (c) {
            if (c.nodeType === 1 && (c.nodeName === "UL" || c.nodeName === "OL")) { nested.push(c); return; }
            if (c.nodeType === 1 && /^(P|DIV)$/.test(c.nodeName)) {
              if (item.firstChild) item.appendChild(br());
              inlineInto(c, item, {});
            } else inlineInto({ childNodes: [c] }, item, {});
          });
          mergeAdjacent(item);
          if (!item.firstChild && keepMode) item.appendChild(br());   // (the editor's undo keeps empty items)
          if (item.firstChild) b.appendChild(item);
          nested.forEach(items);
        });
      })(n);
      if (!b.firstChild && keepMode) { var li0 = el("li"); li0.appendChild(br()); b.appendChild(li0); }
      if (b.firstChild) out.appendChild(b);
      return;
    }
    if (tag === "BLOCKQUOTE") {
      b = el("blockquote");
      if (hasBlockChild(n)) {     // a quote holding paragraphs: one block, lines kept
        each(n.childNodes, function (c) {
          if (c.nodeType === 1 && BLOCKISH.test(c.nodeName)) {
            if (isBlank(c)) return;
            if (b.firstChild) b.appendChild(br());
            inlineInto(c, b, {});
          } else inlineInto({ childNodes: [c] }, b, {});
        });
        mergeAdjacent(b);
      } else b = inlineBlock("blockquote", n);
      if (!b.textContent.trim()) {   // an empty quote line is not part of the story (the editor's undo keeps it)
        if (!keepMode) return;
        if (!b.firstChild) b.appendChild(br());
      }
      var prevQ = out.lastChild;
      if (opts.merge && prevQ && prevQ.nodeName === "BLOCKQUOTE") {   // in the editor each Enter makes a new quote line: they read as one quote
        prevQ.appendChild(br());
        while (b.firstChild) prevQ.appendChild(b.firstChild);
        mergeAdjacent(prevQ);
      } else out.appendChild(b);
      return;
    }
    if ((tag === "P" || tag === "DIV" || /^(SECTION|ARTICLE|LI)$/.test(tag)) && hasBlockChild(n)) {   // a wrapper: look inside
      each(n.childNodes, function (c) { blockInto(c, out, opts); });
      return;
    }
    if (tag === "P" || tag === "DIV" || /^(SECTION|ARTICLE|LI|SPAN|B|STRONG|I|EM|A|CODE|FONT|U)$/.test(tag)) {
      b = inlineBlock("p", n);
      if (opts.cards && b.childNodes.length === 1 && b.firstChild.nodeName === "A" && b.firstChild.textContent === b.firstChild.getAttribute("href")) {
        var card = RPB.linkCard(b.firstChild.getAttribute("href"));
        if (card) { out.appendChild(card); return; }
      }
      if (!b.firstChild) b.appendChild(br());
      out.appendChild(b);
      return;
    }
    each(n.childNodes, function (c) { blockInto(c, out, opts); });
  }
  // The blocks of `src` (an element), rebuilt from the whitelist. opts.cards turns a paragraph that is only a link into a link card.
  // opts.keep leaves spaces and empty quote lines as they are (the editor's undo snapshots must restore faithfully).
  RPB.cleanBlocks = function (src, opts) {
    var frag = document.createDocumentFragment();
    keepMode = !!(opts && opts.keep);
    try { each(src.childNodes, function (c) { blockInto(c, frag, opts || {}); }); }
    finally { keepMode = false; }
    // the empty line the editor keeps at the end is not part of the story
    while (frag.lastChild && frag.lastChild.nodeName === "P" && !frag.lastChild.textContent.trim() && !frag.lastChild.querySelector("figure")) frag.lastChild.remove();
    return frag;
  };
  RPB.toHtml = function (frag) {
    var d = document.createElement("div");
    d.appendChild(frag.cloneNode(true));
    return d.innerHTML;
  };
  // Parsed in an inert document first: nothing runs and nothing loads until it has been rebuilt from the whitelist.
  RPB.fromHtml = function (html, opts) {
    var doc = new DOMParser().parseFromString("<!doctype html><body>" + String(html), "text/html");
    return RPB.cleanBlocks(doc.body, opts || {});
  };
  RPB.fromMarkdown = function (md) {
    var doc = new DOMParser().parseFromString("<!doctype html><body>" + RP.md(md), "text/html");
    return RPB.cleanBlocks(doc.body, { cards: true });
  };

  /* ── counting ── */
  // Only what was written: no captions, cards or dividers.
  RPB.plainText = function (frag, spaced) {
    var c = document.createElement("div");
    c.appendChild(frag.cloneNode(true));
    each(c.querySelectorAll("figure, .mk-embed, .mk-stars"), function (n) { n.remove(); });
    if (spaced) {
      each(c.querySelectorAll("br"), function (n) { n.parentNode.replaceChild(txt(" "), n); });
      each(c.querySelectorAll("p, h2, h3, li, blockquote, pre"), function (n) { n.appendChild(txt(" ")); });
    }
    return c.textContent;
  };
  RPB.wordCount = function (frag) { return (RPB.plainText(frag, true).match(/\S+/g) || []).length; };
  // One line for the post list: the first paragraph, cut at a word.
  RPB.summaryOf = function (frag) {
    var p = Array.prototype.filter.call(frag.childNodes, function (n) { return n.nodeName === "P" && n.textContent.trim(); })[0] ||
      Array.prototype.filter.call(frag.childNodes, function (n) { return /^(H2|H3|BLOCKQUOTE|UL|OL)$/.test(n.nodeName) && n.textContent.trim(); })[0];
    if (!p) return "";
    var t = p.textContent.replace(/\s+/g, " ").trim();
    if (t.length <= 140) return t;
    var cut = t.slice(0, 139), sp = cut.lastIndexOf(" ");
    if (t.charAt(139) !== " " && sp > 0) cut = cut.slice(0, sp);
    return cut.replace(/[\s,;:.\-–—]+$/, "") + "…";
  };

  /* ── editor content → markdown (the exact inverse of RP.md for everything the editor can make) ── */
  function escMd(t) { return t.replace(/[\\*`\[\]]/g, "\\$&"); }
  function pct(c) { return "%" + ("0" + c.charCodeAt(0).toString(16).toUpperCase()).slice(-2); }
  // Link addresses: balanced (one level) parentheses stay as they are (Foo_(bar)); everything that could confuse the markdown is percent-encoded.
  function encUrl(u) {
    var groups = [];
    u = u.replace(/[\u0001\u0002]/g, pct);   // those two characters stand in for the kept parentheses below
    u = u.replace(/\(([^()]*)\)/g, function (_, inner) { groups.push(inner); return "\u0001" + (groups.length - 1) + "\u0002"; });
    u = u.replace(/[()\s`\\<>"]/g, pct);
    return u.replace(/\u0001(\d+)\u0002/g, function (_, k) { return "(" + groups[+k].replace(/[()\s`\\<>"]/g, pct) + ")"; });
  }
  function wrap(d, inner) {
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    return m[2] ? m[1] + d + m[2] + d + m[3] : inner;
  }
  function inlineMd(node) {
    var s = "";
    each(node.childNodes, function (c) {
      if (c.nodeType === 3) { s += escMd(c.nodeValue.replace(/[ \t\r\n\f\u00a0]+/g, " ")); return; }
      if (c.nodeType !== 1) return;
      var t = c.nodeName;
      if (t === "BR") s += "\n";
      else if (t === "STRONG") s += wrap("**", inlineMd(c));
      else if (t === "EM") s += wrap("*", inlineMd(c));
      else if (t === "CODE") {
        // the text is kept as it is: the fence is one backtick longer than any run inside, with a padding space when the text touches a backtick or is itself padded
        var code = c.textContent.replace(/\u00a0/g, " ").replace(/[\r\n]+/g, " ");
        if (code.trim()) {
          var run = 0;
          (code.match(/`+/g) || []).forEach(function (m) { if (m.length > run) run = m.length; });
          var fence = new Array(run + 2).join("`"), pad = /^`|`$/.test(code) || /^ .* $/.test(code) ? " " : "";
          s += fence + pad + code + pad + fence;
        }
      }
      else if (t === "A") { var inner = inlineMd(c), href = c.getAttribute("href") || ""; s += inner.trim() && URL_RE.test(href) ? "[" + inner + "](" + encUrl(href) + ")" : inner; }
      else s += inlineMd(c);
    });
    return s;
  }
  // The lines of a block. A line break inside a paragraph is kept; an empty line inside it is written as a lone backslash.
  function lines(node) {
    var ls = inlineMd(node).split("\n").map(function (l) { return l.trim(); });
    while (ls.length && !ls[ls.length - 1]) ls.pop();
    while (ls.length && !ls[0]) ls.shift();
    return ls.map(function (l) { return l || "\\"; });
  }
  function flat(node) {
    return inlineMd(node).split("\n").map(function (l) { return l.trim(); }).filter(Boolean).join(" ");
  }
  function protect(first) {    // a paragraph must not start like another block
    if (/^#{1,3}(\s|$)/.test(first)) return "\\" + first;
    if (/^>/.test(first)) return "\\" + first;
    if (/^-(\s|-)/.test(first) || first === "-") return "\\" + first;
    if (/^\d+\.(\s|$)/.test(first)) return first.replace(".", "\\.");
    if (/^!\[/.test(first)) return "\\" + first;
    if (/^@\[/.test(first)) return "\\" + first;
    return first;
  }
  function figureMd(f, slug) {
    var src;
    if (f.getAttribute("data-name")) {
      if (!NAME_RE.test(f.getAttribute("data-name"))) return "";
      src = "images/" + slug + "/" + f.getAttribute("data-name");
      if (!RP.IMG_REL.test(src)) return "";
    } else if (f.getAttribute("data-remote") && UNS_RE.test(f.getAttribute("data-remote"))) src = f.getAttribute("data-remote");
    else return "";
    var alt = (f.getAttribute("data-alt") || "").replace(/[\[\]"\\]/g, " ").replace(/\s+/g, " ").trim();
    var cap = f.querySelector("figcaption"), c = cap ? flat(cap).replace(/"/g, "\u201d") : "";
    var size = f.getAttribute("data-size");
    return "![" + alt + "](" + src + (c ? ' "' + c + '"' : "") + ")" + (size === "wide" || size === "full" ? "{." + size + "}" : "");
  }
  // `frag`: the result of cleanBlocks. slug: where this story's pictures will live.
  RPB.toMarkdown = function (frag, slug) {
    var out = [];
    each(frag.childNodes, function (n) {
      var t = n.nodeName, ls, s = "";
      if (t === "P") { ls = lines(n); if (ls.length) { ls[0] = protect(ls[0]); s = ls.join("\n"); } }
      else if (t === "H2" || t === "H3") { s = flat(n); if (s) s = (t === "H2" ? "## " : "### ") + s; }
      else if (t === "BLOCKQUOTE") { ls = inlineMd(n).split("\n").map(function (l) { return l.trim(); }); while (ls.length && !ls[ls.length - 1]) ls.pop(); while (ls.length && !ls[0]) ls.shift(); if (ls.length) s = ls.map(function (l) { return l ? "> " + l : ">"; }).join("\n"); }
      else if (t === "UL" || t === "OL") {
        var k = 0, items = [];
        each(n.children, function (li) {
          var l = lines(li);
          if (!l.length) return;
          k++;
          items.push((t === "UL" ? "- " : k + ". ") + l[0] + l.slice(1).map(function (x) { return "\n  " + x; }).join(""));
        });
        s = items.join("\n");
      }
      else if (t === "PRE") {
        var code = codeText(n);
        if (code.trim()) {
          var run = 2;
          code.split("\n").forEach(function (l) { var m = /^`+/.exec(l); if (m && m[0].length > run) run = m[0].length; });
          var fence = new Array(run + 2).join("`");
          s = fence + "\n" + code + "\n" + fence;
        }
      }
      else if (t === "FIGURE") s = figureMd(n, slug);
      else if (t === "DIV" && n.classList.contains("mk-stars")) s = "---";
      else if (t === "DIV" && n.getAttribute("data-kind") === "video") { var v = RP.parseVideo(n.getAttribute("data-url") || ""); if (v) s = "@[video](" + v.canonical + ")"; }
      else if (t === "DIV" && n.getAttribute("data-kind") === "link") { var u = n.getAttribute("data-url") || ""; if (URL_RE.test(u)) s = "[" + escMd(u) + "](" + encUrl(u) + ")"; }
      if (s) out.push(s);
    });
    return out.join("\n\n") + (out.length ? "\n" : "");
  };
})();
