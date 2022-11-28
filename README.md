# Verses

Verses is an NFT project exploring the infinite space of language. Participants can "own", as an NFT, globally unique language that is meaningful to them, and use the global set of NFTs to construct arbitrarily complex artifacts of language.

How does it work? The project consists of two kinds of NFTs: **Phrases** and **Verses**. 

A Phrase is a globally unique, 32-byte string. (This means a Phrase can accommodate up to 31 ASCII characters, or between 7 and 31 Unicode characters in UTF-8 encoding. (One byte is used for the termination of the string.)) You can think of Phrases as the atomic unit of the project; they are the smallest building block.

A Verse is a globally unique concatenation of Phrases and/or other Verses. Because a Verse can reference another Verse, Verses can build on each other. The possible complexity of Verses is bounded only by the computational limits of the EVM.

Verses also support a special kind of metadata: they can have **bases**. A Verse's base(s) are the other Verses that it is responding to, in some sense that is intentionally left open to participants to decide and interpret for themselves. The purpose of bases is to allow Verses to relate to each other in ways besides the reuse of their actual content.

A few more things:
- Phrases and Verses are immutable. They can't be modified after minting.
- In their content, Verses can't reference themselves, but they can reference future Verses, i.e. Verses that haven't been minted yet. This enables some cool possibilities...
- In their bases, Verses can't reference themselves or future Verses, because that would be incoherent with the idea of a base as something being responded to. In this way, bases enforce a direction of time. This design decision is intended to support a notion of conversation: Verses as an exchange of language across time.
- For both Phrases and Verses, there is a special token with id 0, representing an empty Phrase / Verse. This empty token can be used in a Verse as a placeholder, so that the Verse becomes a sort of template, which other Verses can fill in by replacing the placeholder.

# FAQ

## How can I use this?

The project has not been deployed, pending testing, audit, and gas optimization.

To mint phrases or verses in your local development environment:

Start your local Hardhat node:
```
npm run start
```

Deploy the contracts:
```
npm run deploy
```

Mint the phrases and/or verses in your `mint-config.json`:
```
HARDHAT_NETWORK=localhost npm run mint -- -c mint-config.json
```
where `mint-config.json` is of `MintConfig` type.

## How should I use this?

Phrases and Verses can have any textual content. Words, sentences, prose, poetry, memes, gibberish: it's up to you. The project was conceived around written language, but there's no reason you couldn't assemble Phrases and Verses into ASCII art.

## Are the contracts upgradeable?

Both the Phrases and the Verses contracts are upgradeable.
