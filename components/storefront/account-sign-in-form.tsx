"use client";

export function AccountSignInForm() {
  return (
    <form className="mt-8 space-y-4" onSubmit={(event) => event.preventDefault()}>
      <label className="block text-sm font-medium text-gray-700">
        Email
        <input
          type="email"
          required
          placeholder="you@example.com"
          className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-black focus:ring-1 focus:ring-black"
        />
      </label>
      <button
        type="submit"
        className="w-full rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
      >
        Continue
      </button>
    </form>
  );
}
