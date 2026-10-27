import { useState } from 'react';
import { CONTACT_EMAIL } from '../../config/contact.js';

/**
 * صفحة ملاحظات (Feedback) بسيطة.
 *   - يجمع الاسم، البريد، والرسالة (ملاحظات).
 *   - عند الإرسال يفتح رابط mailto يرسل إلى البريد الموجود في config.
 */
export default function Feedback() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });

  const update = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const mailtoLink = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Feedback')}&body=${encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\n\nFeedback:\n${form.message}`)}`;

  return (
    <section className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Feedback</h1>
      <form className="grid gap-4">
        <input
          type="text"
          placeholder="Your name"
          value={form.name}
          onChange={update('name')}
          className="rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
          required
        />
        <input
          type="email"
          placeholder="Your email"
          value={form.email}
          onChange={update('email')}
          className="rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
          required
        />
        <textarea
          placeholder="Your feedback"
          rows={5}
          value={form.message}
          onChange={update('message')}
          className="rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand"
          required
        />
        <a
          href={mailtoLink}
          className="inline-block w-fit rounded bg-brand px-4 py-2 text-white transition hover:brightness-95"
        >
          Send via Email
        </a>
      </form>
    </section>
  );
}
