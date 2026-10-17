# rumi-pulp

The personal blog of Rumi, a creative writer in Kuala Lumpur. It's a plain website
(HTML, CSS and a little JavaScript) with nothing to install and no build step.

## Write a post

1. Open a terminal in the `rumi-pulp` folder and run `node serve.js`.
2. Open http://localhost:4321/write.html in Chrome or Edge.
3. Write your post and press **Publish**. The first time, choose the `rumi-pulp`
   folder (the one that contains `index.html`). Your browser remembers it after that.
4. To put it online, commit and push the change (GitHub Desktop: Commit to main,
   then Push origin).

Drafts save automatically in your browser. To fix a published post, open it from
"edit a published post" at the bottom of the write page and publish again.

## Where posts live

Each post is a file in `posts/` (for example `posts/my-first-post.md`). The list of
posts is `posts/index.json`; the write page keeps it up to date for you.

## Preview the site locally

Run `node serve.js` and open http://localhost:4321. The **write** tab only appears
when the site runs on your own computer.

## Files

- `index.html`, `blog.html`, `post.html`, `write.html` and their `.js` files: the pages
- `styles.css`: the look
- `site.js`: the status bar, theme and helpers shared by every page
- `assets/`: images and icons
