This handbook is a small shelf of notes and guides, kept in one place. This first chapter shows you how to add your own chapters. It takes about two minutes to read.

## Adding a chapter

You do not need to install anything. A chapter is just a text file, and the list of chapters is just another small text file.

### Step by step

1. Create a new file in the `handbook` folder, for example `handbook/my-chapter.md`. Use only lowercase letters, numbers and hyphens in the name, with no spaces.
2. Write your chapter in it. Leave an empty line between paragraphs.
3. Open `handbook/index.json` and add one line for your chapter under the right part.
4. Save both files, then commit and push, the same way you do for a story.
5. Wait a minute or two, then reload the handbook page.

### What goes in index.json

The file lists your parts, and each part lists its chapters. Here is a tiny one with two chapters:

```json
{
  "title": "Handbook",
  "parts": [
    {
      "name": "Getting started",
      "for": "Start here if you are brand new.",
      "chapters": [
        { "slug": "welcome", "title": "Welcome" },
        { "slug": "my-chapter", "title": "My chapter" }
      ]
    }
  ]
}
```

The `slug` is the file name without `.md`, so `my-chapter` means the file `handbook/my-chapter.md`. The `title` is what readers see.

### Order matters

Chapters appear in the order you list them, one after another across all the parts. The Next button at the bottom of each chapter follows that same order. To move a chapter, move its line up or down.

## Writing the chapter

### Headings make the outline

Start a section with `##` and a smaller one with `###`, followed by a space and the heading text. Every heading you add shows up in the "in this chapter" list beside the text, so readers can jump straight to it. You do not need to repeat the chapter title at the top, because it is shown for you.

### Small extras

You can also add these to a part or a chapter in `index.json`. They are all optional.

1. `minutes`: how long the chapter takes to read. Leave it out and it is worked out from the length.
2. `updated`: the date you last changed it, written like `2026-10-23`.
3. `about`: a short note under the part name on the front page.

## Good to know

### A missing comma breaks the list

If you forget a comma in `index.json`, the whole handbook stops working, so if it looks wrong, check your commas and quotes.

### Nothing is saved in the cloud

The little `[x]` and `[ ]` marks that show which chapters a reader has finished are kept only in their own browser. Nothing is sent or saved anywhere else, so clearing the browser or using another device starts them fresh.
