import {
  genIsArrayOf,
  isNumber,
  isPlainObject,
  isString,
  typeGuardedArray,
} from "../util"

export type MintConfigPhrase = string
export const isMintConfigPhrase = (val: unknown): val is MintConfigPhrase =>
  isString(val)

export const isArrayOfMintConfigPhrase = genIsArrayOf(isMintConfigPhrase)

export type MintConfigVerseElement =
  | {
      kind: "phraseId" | "verseId"
      value: string
    }
  | {
      kind: "newPhraseIndex" | "newVerseIndex"
      value: number
    }
export const isMintConfigVerseElement = (
  obj: unknown,
): obj is MintConfigVerseElement =>
  isPlainObject(obj) &&
  (((obj.kind === "phraseId" || obj.kind === "verseId") &&
    isString(obj.value)) ||
    ((obj.kind === "newPhraseIndex" || obj.kind === "newVerseIndex") &&
      isNumber(obj.value)))

export type MintConfigVerseBase =
  | {
      kind: "verseId"
      value: string
    }
  | {
      kind: "newVerseIndex"
      value: number
    }
export const isMintConfigVerseBase = (
  obj: unknown,
): obj is MintConfigVerseBase =>
  isPlainObject(obj) &&
  ((obj.kind === "verseId" && isString(obj.value)) ||
    (obj.kind === "newVerseIndex" && isNumber(obj.value)))

export type MintConfigVerse = {
  elements: MintConfigVerseElement[]
  bases: MintConfigVerseBase[]
  expectedContent: string
}
export const isMintConfigVerse = (obj: unknown): obj is MintConfigVerse =>
  isPlainObject(obj) &&
  typeGuardedArray(obj.elements, isMintConfigVerseElement) &&
  typeGuardedArray(obj.bases, isMintConfigVerseBase) &&
  isString(obj.expectedContent)

export const isArrayOfMintConfigVerse = genIsArrayOf(isMintConfigVerse)

export type MintConfig = {
  phrases: MintConfigPhrase[]
  verses: MintConfigVerse[]
}
export const isMintConfig = (obj: unknown): obj is MintConfig =>
  isPlainObject(obj) &&
  isArrayOfMintConfigPhrase(obj.phrases) &&
  isArrayOfMintConfigVerse(obj.verses)
