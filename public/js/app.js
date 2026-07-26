'use strict';

/**
 * Node Notes — frontend logic.
 * Vanilla JavaScript only. Talks to the API exposed by src/server.js.
 */

(function () {
  const API_BASE = '/api/notes';
  const TITLE_MAX = 80;
  const CONTENT_MAX = 1000;

  // ---------------------------------------------------------------------
  // Footer year (present on every page)
  // ---------------------------------------------------------------------
  function setFooterYear() {
    const el = document.getElementById('footer-year');
    if (el) {
      el.textContent = String(new Date().getFullYear());
    }
  }

  // ---------------------------------------------------------------------
  // Notes app (only runs on pages that contain the notes UI)
  // ---------------------------------------------------------------------
  function setupNotesApp() {
    const form = document.getElementById('note-form');
    const notesGrid = document.getElementById('notes-grid');
    if (!form || !notesGrid) return; // Not on this page.

    const titleInput = document.getElementById('note-title');
    const contentInput = document.getElementById('note-content');
    const titleCounter = document.getElementById('title-counter');
    const contentCounter = document.getElementById('content-counter');
    const titleError = document.getElementById('title-error');
    const contentError = document.getElementById('content-error');
    const submitBtn = document.getElementById('submit-btn');
    const formStatus = document.getElementById('form-status');
    const notesStatus = document.getElementById('notes-status');
    const notesCount = document.getElementById('notes-count');
    const emptyState = document.getElementById('empty-state');

    // -- Character counters --------------------------------------------
    function updateCounter(input, counterEl, max) {
      const length = input.value.length;
      counterEl.textContent = `${length} / ${max}`;
      counterEl.classList.toggle('is-limit', length >= max);
    }

    titleInput.addEventListener('input', () => updateCounter(titleInput, titleCounter, TITLE_MAX));
    contentInput.addEventListener('input', () => updateCounter(contentInput, contentCounter, CONTENT_MAX));
    updateCounter(titleInput, titleCounter, TITLE_MAX);
    updateCounter(contentInput, contentCounter, CONTENT_MAX);

    // -- Date formatting --------------------------------------------------
    function formatDate(isoString) {
      try {
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return 'Unknown date';
        return date.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
      } catch (err) {
        return 'Unknown date';
      }
    }

    // -- Rendering ----------------------------------------------------------
    function clearFieldErrors() {
      titleError.textContent = '';
      contentError.textContent = '';
      titleInput.closest('.form-field').classList.remove('has-error');
      contentInput.closest('.form-field').classList.remove('has-error');
    }

    function showFormStatus(message, kind) {
      formStatus.textContent = message;
      formStatus.classList.remove('is-success', 'is-error');
      if (kind === 'success') formStatus.classList.add('is-success');
      if (kind === 'error') formStatus.classList.add('is-error');
    }

    function showNotesStatus(message, kind) {
      notesStatus.textContent = message || '';
      notesStatus.classList.remove('is-error');
      if (kind === 'error') notesStatus.classList.add('is-error');
    }

    function setSubmitting(isSubmitting) {
      submitBtn.disabled = isSubmitting;
      submitBtn.classList.toggle('is-loading', isSubmitting);
    }

    function slugify(title) {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      return (slug || 'note') + '.md';
    }

    function createNoteCard(note) {
      const li = document.createElement('li');
      li.className = 'note-card';
      li.dataset.id = note.id;

      const tab = document.createElement('div');
      tab.className = 'note-card-tab';

      const traffic = document.createElement('span');
      traffic.className = 'traffic';
      traffic.setAttribute('aria-hidden', 'true');
      traffic.appendChild(document.createElement('span'));
      traffic.appendChild(document.createElement('span'));
      traffic.appendChild(document.createElement('span'));

      const filename = document.createElement('span');
      filename.className = 'filename';
      filename.textContent = slugify(note.title); // textContent only — never innerHTML.

      tab.appendChild(traffic);
      tab.appendChild(filename);

      const body = document.createElement('div');
      body.className = 'note-card-body';

      const title = document.createElement('h3');
      title.className = 'note-card-title';
      title.textContent = note.title; // textContent only — never innerHTML.

      const content = document.createElement('p');
      content.className = 'note-card-content';
      content.textContent = note.content;

      const footer = document.createElement('div');
      footer.className = 'note-card-footer';

      const date = document.createElement('span');
      date.className = 'note-card-date';
      date.textContent = formatDate(note.createdAt);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'note-delete-btn';
      deleteBtn.textContent = 'Delete';
      deleteBtn.setAttribute('aria-label', `Delete note titled ${note.title}`);
      deleteBtn.addEventListener('click', () => handleDelete(note.id, note.title, li, deleteBtn));

      footer.appendChild(date);
      footer.appendChild(deleteBtn);

      body.appendChild(title);
      body.appendChild(content);
      body.appendChild(footer);

      li.appendChild(tab);
      li.appendChild(body);

      return li;
    }

    function renderNotes(notes) {
      notesGrid.innerHTML = '';

      if (!Array.isArray(notes) || notes.length === 0) {
        emptyState.hidden = false;
        notesCount.textContent = '0 notes';
        return;
      }

      emptyState.hidden = true;
      notesCount.textContent = `${notes.length} ${notes.length === 1 ? 'note' : 'notes'}`;

      // Show newest first.
      const sorted = [...notes].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const fragment = document.createDocumentFragment();
      sorted.forEach((note) => fragment.appendChild(createNoteCard(note)));
      notesGrid.appendChild(fragment);
    }

    // -- Networking -----------------------------------------------------
    async function fetchNotes() {
      showNotesStatus('Loading notes…');
      try {
        const response = await fetch(API_BASE, { method: 'GET' });
        const data = await safeParseJson(response);

        if (!response.ok || !data || data.success !== true || !Array.isArray(data.notes)) {
          showNotesStatus('Could not load notes. Please refresh the page.', 'error');
          renderNotes([]);
          return;
        }

        showNotesStatus('');
        renderNotes(data.notes);
      } catch (err) {
        showNotesStatus('Network error while loading notes. Check your connection and try again.', 'error');
        renderNotes([]);
      }
    }

    async function safeParseJson(response) {
      try {
        return await response.json();
      } catch (err) {
        return null;
      }
    }

    async function handleCreate(event) {
      event.preventDefault();
      clearFieldErrors();
      showFormStatus('', null);

      const title = titleInput.value.trim();
      const content = contentInput.value.trim();

      let hasError = false;
      if (title.length === 0) {
        titleError.textContent = 'Title is required.';
        titleInput.closest('.form-field').classList.add('has-error');
        hasError = true;
      } else if (title.length > TITLE_MAX) {
        titleError.textContent = `Title must be at most ${TITLE_MAX} characters.`;
        titleInput.closest('.form-field').classList.add('has-error');
        hasError = true;
      }

      if (content.length === 0) {
        contentError.textContent = 'Content is required.';
        contentInput.closest('.form-field').classList.add('has-error');
        hasError = true;
      } else if (content.length > CONTENT_MAX) {
        contentError.textContent = `Content must be at most ${CONTENT_MAX} characters.`;
        contentInput.closest('.form-field').classList.add('has-error');
        hasError = true;
      }

      if (hasError) {
        showFormStatus('Please fix the highlighted fields.', 'error');
        return;
      }

      setSubmitting(true);

      try {
        const response = await fetch(API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, content }),
        });

        const data = await safeParseJson(response);

        if (response.status === 201 && data && data.success) {
          form.reset();
          updateCounter(titleInput, titleCounter, TITLE_MAX);
          updateCounter(contentInput, contentCounter, CONTENT_MAX);
          showFormStatus('Note created successfully.', 'success');
          await fetchNotes();
          return;
        }

        if (data && Array.isArray(data.details) && data.details.length > 0) {
          showFormStatus(data.details.join(' '), 'error');
        } else if (data && data.error) {
          showFormStatus(data.error, 'error');
        } else {
          showFormStatus('Something went wrong while saving your note.', 'error');
        }
      } catch (err) {
        showFormStatus('Network error. Please check your connection and try again.', 'error');
      } finally {
        setSubmitting(false);
      }
    }

    async function handleDelete(id, title, cardEl, buttonEl) {
      const confirmed = window.confirm(`Delete the note "${title}"? This cannot be undone.`);
      if (!confirmed) return;

      buttonEl.disabled = true;
      const previousLabel = buttonEl.textContent;
      buttonEl.textContent = 'Deleting…';

      try {
        const response = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        const data = await safeParseJson(response);

        if (response.ok && data && data.success) {
          cardEl.remove();
          showNotesStatus('Note deleted.');
          if (!notesGrid.children.length) {
            emptyState.hidden = false;
            notesCount.textContent = '0 notes';
          } else {
            const remaining = notesGrid.children.length;
            notesCount.textContent = `${remaining} ${remaining === 1 ? 'note' : 'notes'}`;
          }
          return;
        }

        showNotesStatus((data && data.error) || 'Could not delete this note.', 'error');
      } catch (err) {
        showNotesStatus('Network error while deleting the note.', 'error');
      } finally {
        buttonEl.disabled = false;
        buttonEl.textContent = previousLabel;
      }
    }

    form.addEventListener('submit', handleCreate);

    // Initial load.
    fetchNotes();
  }

  document.addEventListener('DOMContentLoaded', () => {
    setFooterYear();
    setupNotesApp();
  });
})();
