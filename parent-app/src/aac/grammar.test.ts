import { describe, expect, test } from "vitest";
import { inflect } from "./grammar";

describe("inflect", () => {
  test("+ed on irregulars", () => {
    expect(inflect("eat", "ed")).toBe("ate");
    expect(inflect("go", "ed")).toBe("went");
    expect(inflect("do", "ed")).toBe("did");
    expect(inflect("run", "ed")).toBe("ran");
    expect(inflect("read", "ed")).toBe("read");
  });

  test("+ed on regulars with spelling rules", () => {
    expect(inflect("play", "ed")).toBe("played");       // -y after vowel: just +ed
    expect(inflect("cry", "ed")).toBe("cried");         // -y after consonant: -ied
    expect(inflect("like", "ed")).toBe("liked");        // silent -e: +d
    expect(inflect("hop", "ed")).toBe("hopped");        // short mono: double
    expect(inflect("look", "ed")).toBe("looked");       // irregular table short-circuits
    expect(inflect("help", "ed")).toBe("helped");       // regular default
  });

  test("+ing on irregulars + rules", () => {
    expect(inflect("eat", "ing")).toBe("eating");
    expect(inflect("go", "ing")).toBe("going");
    expect(inflect("lie", "ing")).toBe("lying");        // -ie -> -ying
    expect(inflect("make", "ing")).toBe("making");      // drop -e
    expect(inflect("sit", "ing")).toBe("sitting");      // double
    expect(inflect("run", "ing")).toBe("running");
  });

  test("+s plural / 3rd person", () => {
    expect(inflect("cup", "s")).toBe("cups");
    expect(inflect("fox", "s")).toBe("foxes");          // -x -> +es
    expect(inflect("bus", "s")).toBe("buses");          // -s -> +es
    expect(inflect("cry", "s")).toBe("cries");          // -y after consonant
    expect(inflect("day", "s")).toBe("days");           // -y after vowel
    expect(inflect("child", "s")).toBe("children");     // irregular plural
    expect(inflect("go", "s")).toBe("goes");            // irregular verb
    expect(inflect("eat", "s")).toBe("eats");           // irregular verb 3rd-person
    expect(inflect("knife", "s")).toBe("knives");
  });

  test("'s possessive", () => {
    expect(inflect("Pranava", "'s")).toBe("Pranava's");
    expect(inflect("mum", "'s")).toBe("mum's");
    expect(inflect("James", "'s")).toBe("James'");      // already ends in s
  });

  test("case is preserved on the first letter", () => {
    expect(inflect("Eat", "ed")).toBe("Ate");
    expect(inflect("Cup", "s")).toBe("Cups");
  });

  test("empty input is returned as-is", () => {
    expect(inflect("", "ed")).toBe("");
  });
});
