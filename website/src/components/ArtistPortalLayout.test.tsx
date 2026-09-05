// @vitest-environment jsdom
//
// The artist sidebar groups its pages: My Portfolio (Works, Collections, Showroom),
// Venues & Buyers (Messages, Enquiries, Placements, Offers, Orders) and Social
// (Posts, Blogs). These tests pin how a group row behaves, how a group
// remembers being expanded, the tab strip a grouped page carries above its
// content, and the document title, which keeps naming the page rather than
// the group.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent, within } from "@testing-library/react";

// One router object for the whole file. The layout's profile check lists the
// router in its effect deps, so a mock that built a fresh object per render
// would re-run that effect on every commit and bounce the layout back to its
// loader. The real useRouter() is stable, and so is this.
const { replace, push, router, authFetchMock, useAuthMock } = vi.hoisted(() => {
  const replace = vi.fn();
  const push = vi.fn();
  return { replace, push, router: { replace, push }, authFetchMock: vi.fn(), useAuthMock: vi.fn() };
});

// The chrome now reads the route itself (it is rendered once by
// artist-portal/layout.tsx, which passes no activePath). These tests still
// pass activePath explicitly, so usePathname only has to exist.
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/artist-portal" }));
// A bare anchor. jsdom cannot navigate, so the click is swallowed after the
// component's own handler has run.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
    [k: string]: unknown;
  }) => (
    <a
      href={href}
      onClick={(e) => {
        onClick?.(e);
        e.preventDefault();
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: useAuthMock }));
vi.mock("@/lib/api-client", () => ({ authFetch: authFetchMock }));
// Blogs on, so Social has two children and a two-tab strip.
vi.mock("@/lib/feature-flags", () => ({ isFlagOn: (flag: string) => flag === "BLOGS_V1" }));

import ArtistPortalLayout from "./ArtistPortalLayout";

const CHILD = "artist-page-content";
const STORAGE_PREFIX = "wallplace.artistNav.";

// vitest's jsdom hands out a localStorage without the Storage surface (no
// clear, no getItem), which CartContext.test.tsx hit as well. Each test
// installs a small complete in-memory one; the accessor test swaps in a
// throwing getter instead.
function memoryStorage(overrides: Partial<Storage> = {}): Storage {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    ...overrides,
  };
  return storage;
}

let originalStorage: PropertyDescriptor | undefined;

function installStorage(descriptor: PropertyDescriptor) {
  Object.defineProperty(window, "localStorage", { configurable: true, ...descriptor });
}

function reply(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

async function renderAt(activePath: string) {
  render(
    <ArtistPortalLayout activePath={activePath}>
      <span>{CHILD}</span>
    </ArtistPortalLayout>,
  );
  await screen.findByText(CHILD);
}

function sidebar() {
  return screen.getByRole("navigation", { name: "Artist portal" });
}

function groupList(key: string) {
  const el = document.getElementById(`artist-nav-group-${key}`);
  if (!el) throw new Error(`no group list for ${key}`);
  return el as HTMLUListElement;
}

function toggleFor(groupLabel: string) {
  return screen.getByRole("button", {
    name: new RegExp(`^(Expand|Collapse) ${groupLabel.replace("&", "&")}$`),
  }) as HTMLButtonElement;
}

function groupRow(groupLabel: string) {
  const row = within(sidebar()).getByRole("link", { name: groupLabel }).parentElement;
  if (!row) throw new Error(`no row for ${groupLabel}`);
  return row;
}

beforeEach(() => {
  originalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
  installStorage({ value: memoryStorage() });
  document.title = "";
  replace.mockReset();
  push.mockReset();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({
    user: { id: "u-1", email: "maya@example.com" },
    loading: false,
    userType: "artist",
    displayName: "Maya Chen",
    signOut: vi.fn(),
  });
  authFetchMock.mockReset();
  authFetchMock.mockResolvedValue(reply({ profile: { id: "p-1" } }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalStorage) Object.defineProperty(window, "localStorage", originalStorage);
});

describe("<ArtistPortalLayout /> sidebar groups", () => {
  it("renders the grouped sidebar in the owner's order, every group collapsed on the dashboard", async () => {
    await renderAt("/artist-portal");
    const visible = within(sidebar())
      .getAllByRole("link")
      .map((a) => a.textContent?.trim());
    expect(visible).toEqual([
      "Dashboard",
      "Edit Profile",
      "My Portfolio",
      "Venues & Buyers",
      "Social",
      "Saved",
      "QR Labels",
      "Analytics",
      "Billing",
      "Settings",
    ]);
    for (const key of ["my-portfolio", "venues-buyers", "social"]) {
      expect(groupList(key).hidden).toBe(true);
    }
  });

  it("makes each group label a link to its first page", async () => {
    await renderAt("/artist-portal");
    const hrefOf = (label: string) => within(sidebar()).getByRole("link", { name: label }).getAttribute("href");
    expect(hrefOf("My Portfolio")).toBe("/artist-portal/portfolio");
    expect(hrefOf("Venues & Buyers")).toBe("/artist-portal/messages");
    expect(hrefOf("Social")).toBe("/artist-portal/posts");
  });

  it("expands and collapses a group from its chevron", async () => {
    await renderAt("/artist-portal");
    const toggle = toggleFor("My Portfolio");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe("artist-nav-group-my-portfolio");
    expect(toggle.disabled).toBe(false);

    fireEvent.click(toggle);
    expect(groupList("my-portfolio").hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-label")).toBe("Collapse My Portfolio");
    const children = within(groupList("my-portfolio"))
      .getAllByRole("link")
      .map((a) => [a.textContent, a.getAttribute("href")]);
    expect(children).toEqual([
      ["Works", "/artist-portal/portfolio"],
      ["Collections", "/artist-portal/collections"],
      ["Showroom", "/artist-portal/showroom"],
    ]);

    fireEvent.click(toggle);
    expect(groupList("my-portfolio").hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Expand My Portfolio");
  });

  it("always expands the group holding the active route and lights the row and the child", async () => {
    await renderAt("/artist-portal/enquiries");
    expect(groupList("venues-buyers").hidden).toBe(false);
    expect(groupList("my-portfolio").hidden).toBe(true);
    expect(groupList("social").hidden).toBe(true);

    const toggle = toggleFor("Venues & Buyers");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.disabled).toBe(true);
    fireEvent.click(toggle);
    expect(groupList("venues-buyers").hidden).toBe(false);

    expect(groupRow("Venues & Buyers").className).toContain("text-accent");
    expect(groupRow("My Portfolio").className).not.toContain("text-accent");
    const list = within(groupList("venues-buyers"));
    expect(list.getByRole("link", { name: "Enquiries" }).className).toContain("text-accent");
    expect(list.getByRole("link", { name: "Messages" }).className).not.toContain("text-accent");
    expect(list.getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Messages",
      "Enquiries",
      "Placements",
      "Offers",
      "Orders",
    ]);
  });

  it("treats a sub-route as its parent page (orders/[id])", async () => {
    await renderAt("/artist-portal/orders/ord_123");
    expect(groupList("venues-buyers").hidden).toBe(false);
    expect(within(groupList("venues-buyers")).getByRole("link", { name: "Orders" }).className).toContain(
      "text-accent",
    );
  });

  it("lights a standalone page without expanding anything", async () => {
    await renderAt("/artist-portal/saved");
    expect(within(sidebar()).getByRole("link", { name: "Saved" }).className).toContain("text-accent");
    expect(within(sidebar()).getByRole("link", { name: "Dashboard" }).className).not.toContain("text-accent");
    for (const key of ["my-portfolio", "venues-buyers", "social"]) {
      expect(groupList(key).hidden).toBe(true);
    }
  });

  it("closes the mobile sidebar on a child link but not on a chevron", async () => {
    await renderAt("/artist-portal");
    const aside = document.querySelector("aside");
    if (!aside) throw new Error("no sidebar");
    fireEvent.click(screen.getByLabelText("Toggle menu"));
    expect(aside.className).not.toContain("-translate-x-full");

    fireEvent.click(toggleFor("Social"));
    expect(aside.className).not.toContain("-translate-x-full");

    fireEvent.click(within(groupList("social")).getByRole("link", { name: "Posts" }));
    expect(aside.className).toContain("-translate-x-full");
  });
});

describe("<ArtistPortalLayout /> remembered expansion", () => {
  it("starts collapsed when nothing is stored", async () => {
    await renderAt("/artist-portal");
    expect(window.localStorage.length).toBe(0);
    for (const key of ["my-portfolio", "venues-buyers", "social"]) {
      expect(groupList(key).hidden).toBe(true);
    }
  });

  it("stores the state under wallplace.artistNav.<group> and restores it on the next mount", async () => {
    await renderAt("/artist-portal");
    fireEvent.click(toggleFor("Social"));
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}social`)).toBe("1");
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}my-portfolio`)).toBeNull();

    cleanup();
    await renderAt("/artist-portal");
    expect(groupList("social").hidden).toBe(false);
    expect(groupList("my-portfolio").hidden).toBe(true);

    fireEvent.click(toggleFor("Social"));
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}social`)).toBe("0");
    cleanup();
    await renderAt("/artist-portal");
    expect(groupList("social").hidden).toBe(true);
  });

  it("does not write the automatic expansion of the active group", async () => {
    await renderAt("/artist-portal/posts");
    expect(groupList("social").hidden).toBe(false);
    expect(window.localStorage.getItem(`${STORAGE_PREFIX}social`)).toBeNull();
  });

  it("keeps a remembered group open on a page outside it", async () => {
    window.localStorage.setItem(`${STORAGE_PREFIX}venues-buyers`, "1");
    await renderAt("/artist-portal/portfolio");
    expect(groupList("venues-buyers").hidden).toBe(false);
    expect(groupList("my-portfolio").hidden).toBe(false);
  });

  it("falls back to collapsed and still toggles when the storage accessor throws", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("site data blocked");
      },
    });
    try {
      await renderAt("/artist-portal");
      expect(groupList("my-portfolio").hidden).toBe(true);
      fireEvent.click(toggleFor("My Portfolio"));
      expect(groupList("my-portfolio").hidden).toBe(false);
      fireEvent.click(toggleFor("My Portfolio"));
      expect(groupList("my-portfolio").hidden).toBe(true);
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
      else Reflect.deleteProperty(window, "localStorage");
    }
  });

  it("still toggles when the write itself throws (quota)", async () => {
    installStorage({
      value: memoryStorage({
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      }),
    });
    await renderAt("/artist-portal");
    fireEvent.click(toggleFor("Venues & Buyers"));
    expect(groupList("venues-buyers").hidden).toBe(false);
  });
});

describe("<ArtistPortalLayout /> section tabs", () => {
  it("renders the group's tab strip above the page for a grouped route", async () => {
    await renderAt("/artist-portal/placements");
    const strip = screen.getByRole("navigation", { name: "Venues & Buyers sections" });
    expect(within(strip).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Messages",
      "Enquiries",
      "Placements",
      "Offers",
      "Orders",
    ]);
    expect(within(strip).getByRole("link", { name: "Placements" }).getAttribute("aria-current")).toBe("page");
    expect(within(strip).getByRole("link", { name: "Messages" }).getAttribute("aria-current")).toBeNull();
    expect(within(strip).getByRole("link", { name: "Orders" }).getAttribute("href")).toBe("/artist-portal/orders");

    const content = screen.getByText(CHILD);
    const main = content.closest("main");
    expect(main?.contains(strip)).toBe(true);
    expect(strip.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("gives the portfolio pages a Works and Collections strip", async () => {
    await renderAt("/artist-portal/collections");
    const strip = screen.getByRole("navigation", { name: "My Portfolio sections" });
    expect(within(strip).getAllByRole("link").map((a) => a.textContent)).toEqual(["Works", "Collections", "Showroom"]);
    expect(within(strip).getByRole("link", { name: "Collections" }).getAttribute("aria-current")).toBe("page");
  });

  it("gives the social pages a Posts and Blogs strip while the flag is on", async () => {
    await renderAt("/artist-portal/blogs");
    const strip = screen.getByRole("navigation", { name: "Social sections" });
    expect(within(strip).getAllByRole("link").map((a) => a.textContent)).toEqual(["Posts", "Blogs"]);
    expect(within(strip).getByRole("link", { name: "Blogs" }).getAttribute("aria-current")).toBe("page");
  });

  it("keeps the strip on a sub-route of a grouped page", async () => {
    await renderAt("/artist-portal/orders/ord_123");
    const strip = screen.getByRole("navigation", { name: "Venues & Buyers sections" });
    expect(within(strip).getByRole("link", { name: "Orders" }).getAttribute("aria-current")).toBe("page");
  });

  it("renders no strip for a standalone page", async () => {
    for (const path of ["/artist-portal", "/artist-portal/profile", "/artist-portal/saved", "/artist-portal/settings"]) {
      cleanup();
      await renderAt(path);
      expect(screen.queryByRole("navigation", { name: /sections$/ })).toBeNull();
      expect(screen.getAllByRole("navigation")).toHaveLength(1);
    }
  });
});

describe("<ArtistPortalLayout /> document title", () => {
  it.each([
    ["/artist-portal", "Dashboard"],
    ["/artist-portal/portfolio", "My Portfolio"],
    ["/artist-portal/collections", "Collections"],
    ["/artist-portal/showroom", "Showroom"],
    ["/artist-portal/showroom/wall_1", "Showroom"],
    ["/artist-portal/offers", "My Offers"],
    ["/artist-portal/orders", "Orders"],
    ["/artist-portal/orders/ord_123", "Orders"],
    ["/artist-portal/posts", "Social Posts"],
    ["/artist-portal/blogs", "Blogs"],
    ["/artist-portal/settings", "Settings"],
  ])("titles %s as %s, never as its group", async (path, section) => {
    await renderAt(path);
    expect(document.title).toBe(`${section} | Artist Portal | Wallplace`);
  });

  it("falls back to the portal name for a path it does not know", async () => {
    await renderAt("/artist-portal/nowhere");
    expect(document.title).toBe("Artist Portal | Artist Portal | Wallplace");
  });
});

describe("<ArtistPortalLayout /> gate", () => {
  it("renders nothing and bounces to /login for a signed-out visitor", async () => {
    useAuthMock.mockReturnValue({ user: null, loading: false, userType: null, displayName: "", signOut: vi.fn() });
    render(
      <ArtistPortalLayout activePath="/artist-portal">
        <span>{CHILD}</span>
      </ArtistPortalLayout>,
    );
    expect(screen.queryByText(CHILD)).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
