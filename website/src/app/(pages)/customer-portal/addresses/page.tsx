"use client";

import { useEffect, useState } from "react";
import CustomerPortalLayout from "@/components/CustomerPortalLayout";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import LoadErrorState from "@/components/LoadErrorState";
import { useToast } from "@/context/ToastContext";
import { authFetch, mutate, ApiError } from "@/lib/api-client";
import { COUNTRIES, labelForCountry } from "@/lib/iso-countries";

interface Address {
  id: string;
  full_name: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  country: string;
  is_default: boolean;
  created_at: string;
}

type FormState = {
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  postcode: string;
  country: string;
  isDefault: boolean;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  line1: "",
  line2: "",
  city: "",
  postcode: "",
  country: "GB",
  isDefault: false,
};

export default function CustomerAddressesPage() {
  const { showToast } = useToast();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  // LA-C020: a failed load is not an empty address book.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Address | null>(null);

  function loadAddresses() {
    setLoading(true);
    setLoadError(null);
    authFetch("/api/customer-addresses")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `addresses load failed (${r.status})`);
        return data;
      })
      .then((data) => {
        if (Array.isArray(data.addresses)) setAddresses(data.addresses);
      })
      .catch(() => setLoadError("Could not load your addresses. Please try again."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setCreating(true);
  }

  function startEdit(address: Address) {
    setForm({
      fullName: address.full_name,
      line1: address.line1,
      line2: address.line2 || "",
      city: address.city,
      postcode: address.postcode,
      country: address.country,
      isDefault: address.is_default,
    });
    setEditingId(address.id);
    setCreating(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  }

  async function submit() {
    setSubmitting(true);
    const payload = {
      fullName: form.fullName.trim(),
      line1: form.line1.trim(),
      line2: form.line2.trim() || undefined,
      city: form.city.trim(),
      postcode: form.postcode.trim(),
      country: form.country,
      isDefault: form.isDefault,
    };
    const method = editingId ? "PATCH" : "POST";
    const url = editingId ? `/api/customer-addresses/${editingId}` : "/api/customer-addresses";
    try {
      // Not ratchet-flagged (the verb is the `method` variable, not a literal), but
      // it is a mutation, so migrate it too. mutate throws ApiError on a non-2xx and
      // carries the parsed body on `.payload`, which is where the zod field errors live.
      await mutate(url, { method, body: JSON.stringify(payload) });
      showToast(editingId ? "Address updated" : "Address saved");
      cancelEdit();
      loadAddresses();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.payload as { issues?: { fieldErrors?: Record<string, string[]> } } | null;
        const flat = body?.issues?.fieldErrors;
        const firstField = flat ? Object.values(flat)[0] : null;
        // err.code mirrors the old body.error, so the friendly default still wins
        // when the server sent neither a field error nor an error string.
        const msg = (Array.isArray(firstField) && firstField[0]) || err.code || "Couldn't save address.";
        showToast(msg, { variant: "error", durationMs: 4500 });
      } else {
        showToast("Network error, please try again.", { variant: "error" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function setDefault(address: Address) {
    if (address.is_default) return;
    try {
      await mutate(`/api/customer-addresses/${address.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      });
      showToast("Default address updated");
      loadAddresses();
    } catch (err) {
      showToast(
        err instanceof ApiError ? "Couldn't set default. Try again." : "Network error, please try again.",
        { variant: "error" },
      );
    }
  }

  async function confirmDelete(payload?: { reason?: string }) {
    void payload;
    if (!pendingDelete) return;
    try {
      await mutate(`/api/customer-addresses/${pendingDelete.id}`, {
        method: "DELETE",
      });
      showToast("Address removed");
      loadAddresses();
    } catch (err) {
      showToast(
        err instanceof ApiError ? "Couldn't delete address." : "Network error, please try again.",
        { variant: "error" },
      );
    } finally {
      setPendingDelete(null);
    }
  }

  const formValid =
    form.fullName.trim().length > 0 &&
    form.line1.trim().length > 0 &&
    form.city.trim().length > 0 &&
    form.postcode.trim().length > 0 &&
    form.country.length > 0;

  return (
    <CustomerPortalLayout>
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl">Addresses</h1>
          <p className="text-sm text-muted mt-1">Saved shipping addresses for faster checkout</p>
        </div>
        {!creating && !editingId && (
          <button
            onClick={startCreate}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors"
          >
            Add address
          </button>
        )}
      </div>

      {(creating || editingId) && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (formValid && !submitting) submit();
          }}
          className="bg-surface border border-accent/20 rounded-sm p-5 mb-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-muted mb-1">Full name</span>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                required
                autoFocus
              />
            </label>
            <label className="block">
              <span className="block text-xs text-muted mb-1">Country</span>
              <select
                value={form.country}
                onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="block text-xs text-muted mb-1">Address line 1</span>
              <input
                type="text"
                value={form.line1}
                onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                required
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="block text-xs text-muted mb-1">
                Address line 2 <span className="text-muted/60">(optional)</span>
              </span>
              <input
                type="text"
                value={form.line2}
                onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-muted mb-1">City</span>
              <input
                type="text"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                required
              />
            </label>
            <label className="block">
              <span className="block text-xs text-muted mb-1">Postcode</span>
              <input
                type="text"
                value={form.postcode}
                onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-border rounded-sm text-sm focus:outline-none focus:border-accent/50"
                required
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              className="accent-accent"
            />
            Set as default
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!formValid || submitting}
              className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving..." : editingId ? "Save address" : "Add address"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-muted text-sm py-12 text-center">Loading addresses...</p>
      ) : loadError ? (
        <LoadErrorState message={loadError} onRetry={loadAddresses} />
      ) : addresses.length === 0 && !creating ? (
        <EmptyState
          title="No saved addresses"
          hint="Add one and we'll pre-fill it at checkout next time."
          cta={{ label: "Add address", href: "#" }}
        />
      ) : (
        <ul className="space-y-3">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="bg-surface border border-border rounded-sm p-4 sm:p-5 flex items-start justify-between gap-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-foreground">{a.full_name}</p>
                  {a.is_default && (
                    <span className="text-[10px] uppercase tracking-wider bg-accent/15 text-accent px-1.5 py-0.5 rounded-sm">
                      Default
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted">
                  {a.line1}
                  {a.line2 ? `, ${a.line2}` : ""}
                </p>
                <p className="text-sm text-muted">
                  {a.city}, {a.postcode}
                </p>
                <p className="text-sm text-muted">{labelForCountry(a.country)}</p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0 text-xs">
                {!a.is_default && (
                  <button
                    onClick={() => setDefault(a)}
                    className="text-accent hover:text-accent-hover transition-colors"
                  >
                    Set default
                  </button>
                )}
                <button
                  onClick={() => startEdit(a)}
                  className="text-muted hover:text-foreground transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setPendingDelete(a)}
                  className="text-muted hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this address?"
        body={
          pendingDelete
            ? `${pendingDelete.full_name}, ${pendingDelete.line1}, ${pendingDelete.postcode}`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
      />
    </CustomerPortalLayout>
  );
}
