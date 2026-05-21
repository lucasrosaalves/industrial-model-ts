import { describe, expect, it } from "vitest";
import { toCamel, toPascal } from "../../src/cli/generator/helpers";

describe("toPascal", () => {
  it("converts snake_case", () => {
    expect(toPascal("my_view_name")).toBe("MyViewName");
  });

  it("converts kebab-case", () => {
    expect(toPascal("my-view-name")).toBe("MyViewName");
  });

  it("handles already PascalCase", () => {
    expect(toPascal("MyViewName")).toBe("MyViewName");
  });

  it("handles single word", () => {
    expect(toPascal("user")).toBe("User");
  });
});

describe("toCamel", () => {
  it("converts snake_case", () => {
    expect(toCamel("my_field_name")).toBe("myFieldName");
  });

  it("converts kebab-case", () => {
    expect(toCamel("my-field-name")).toBe("myFieldName");
  });

  it("handles already camelCase", () => {
    expect(toCamel("myFieldName")).toBe("myFieldName");
  });

  it("handles single word", () => {
    expect(toCamel("name")).toBe("name");
  });

  it("handles PascalCase input", () => {
    expect(toCamel("MyField")).toBe("myField");
  });
});
