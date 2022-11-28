export type PreparedPhrase = string

export type PreparedVerseElement = {
  kind: string
  value: string
}
export type PreparedVerseBase = {
  kind: string
  value: string
}
export type PreparedVerse = {
  elements: PreparedVerseElement[]
  bases: PreparedVerseBase[]
}
