# rumi-pulp

The personal blog of Rumi, a creative writer in Kuala Lumpur. It's a plain website
(HTML, CSS and a little JavaScript) with nothing to install and no build step.

## Write a story

1. Open a terminal in the `rumi-pulp` folder and run `node serve.js`.
2. Open http://localhost:4321/stories.html in Chrome or Edge. This page lists your
   drafts, published, unlisted and scheduled stories.
3. Press **Write a story**. Your text saves automatically in your browser as a draft.
4. When you're ready, press **Publish**, check the preview, topics and visibility, then
   press **Publish now** (or switch on **Schedule for later**). The first time, choose the
   `rumi-pulp` folder (the one that contains `index.html`). Your browser remembers it.
5. To put it online, commit and push the change (GitHub Desktop: Commit to main,
   then Push origin).

Things to know:

- **The writing page** has a toolbar along the top, an **outline** of your headings (button
  at the top right) and your word count and goal along the bottom. Press **Esc** for a
  quiet focus mode. Undo and redo are **Ctrl+Z** and **Ctrl+Shift+Z** (Cmd on a Mac).
- **Fixing a story:** on the stories page open the story's **Actions** menu and choose
  **Edit**, then publish again. The same menu can make a story unlisted or public,
  schedule it, move it back to drafts (**Unpublish**) or delete it.
- **Free photos (optional):** the photo button in the editor searches Unsplash. The first
  time it asks for a free access key from https://unsplash.com/developers. The key is kept
  only in your browser on your own computer.
- **Pictures** you add are saved into `posts/images/<story>/` when you publish.
- **Scheduled stories** are hidden on your blog until their date and time. Their text
  file is on GitHub as soon as you push, so someone with the exact link could read a
  scheduled story early.
- **RSS feed:** `feed.xml` is rebuilt every time you publish or change a story. It can't
  add a scheduled story by itself when the date arrives, so when you open **Your stories**
  after that date you'll see "1 scheduled post is now live". Press **Update RSS feed**,
  then commit and push.
- **Unfinished publish:** if a first publish fails, the files it saved are removed again.
  If that clean-up fails too, the draft is marked "unfinished publish". Press **Publish**
  again to finish it, or choose **Delete and clean up** in its Actions menu.
- **Private notes** you add in the editor are kept only in your draft. They are never
  published.
- Publishing needs Chrome or Edge, because those can save straight into your folder.

## Where things live

Each story is a markdown file in `posts/` (for example `posts/my-story.md`), with a small
`posts/my-story.html` page that makes Google and social previews look right. The list of
stories is `posts/index.json`; the stories page keeps it, `feed.xml` and the pictures up
to date for you.

## Preview the site locally

Run `node serve.js` and open http://localhost:4321. The **stories** tab only appears
when the site runs on your own computer.

## Files

- `index.html`, `blog.html`, `post.html`, `stories.html`, `write.html` and their `.js`
  files: the pages
- `styles.css`: the look
- `site.js`: the status bar, theme, markdown and helpers shared by every page
- `owner.js`, `blocks.js`: the tools behind the stories and writing pages
- `feed.xml`: the RSS feed
