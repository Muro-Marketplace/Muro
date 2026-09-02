// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { company } = vi.hoisted(() => ({
  company: { tradingName: "Wallplace", legalName: "", number: "", registeredOffice: "" },
}));
vi.mock("@/lib/company", () => ({
  COMPANY: company,
  isIncorporated: () => company.number.trim().length > 0,
}));

import LegalEntityNote from "./LegalEntityNote";

afterEach(() => {
  cleanup();
  company.legalName = "";
  company.number = "";
  company.registeredOffice = "";
});

describe("<LegalEntityNote />", () => {
  it("shows the pre-incorporation note while there is no company number", () => {
    render(<LegalEntityNote />);
    expect(screen.getByText(/in the process of being incorporated/)).toBeTruthy();
  });

  it("shows the registered details once they exist", () => {
    company.legalName = "Wallplace Ltd";
    company.number = "12345678";
    company.registeredOffice = "1 Example Street, London";
    render(<LegalEntityNote />);
    expect(screen.getByText(/company number 12345678/)).toBeTruthy();
    expect(screen.queryByText(/being incorporated/)).toBeNull();
  });

  // Not part of the brief's spec: the terms page carries one extra, page-specific
  // sentence the other two agreements don't (see LegalEntityNote.tsx doc comment).
  // This drives the `children` prop that lets it append that sentence without
  // duplicating the shared identity copy.
  it("appends page-specific supplementary text passed as children, without disturbing the standard note", () => {
    render(<LegalEntityNote>Extra clause for one page only.</LegalEntityNote>);
    expect(screen.getByText(/in the process of being incorporated/)).toBeTruthy();
    expect(screen.getByText(/Extra clause for one page only\./)).toBeTruthy();
  });
});
