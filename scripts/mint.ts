import { program } from "commander"
import fs from "fs"
import { randomBytes } from "crypto"
import range from "lodash/range"
import zipObject from "lodash/zipObject"

import hre from "hardhat"
import "@nomiclabs/hardhat-ethers"

import {
  ChainDeploymentsInfo,
  isDeploymentsInfo,
  PHRASES_CONTRACT_NAME,
  VERSES_CONTRACT_NAME,
} from "../types/deploy/deployments"
import {
  isMintConfig,
  MintConfig,
  MintConfigVerse,
  MintConfigVerseBase,
  MintConfigVerseElement,
} from "../types/mint/config"
import {
  asNonNullable,
  assertFoundIndex,
  assertNonNullable,
  assertString,
  assertUnreachable,
} from "../types/util"
import { Phrases } from "../typechain/Phrases"
import { Verses } from "../typechain/Verses"
import {
  PreparedPhrase,
  PreparedVerse,
  PreparedVerseBase,
  PreparedVerseElement,
} from "../types/mint/prepared"
import { waitFor } from "../utils/time"
import { BigNumber } from "ethers"

async function compile(): Promise<void> {
  await hre.run("compile")
}

async function getDeployments(): Promise<ChainDeploymentsInfo> {
  const network = asNonNullable(process.env.HARDHAT_NETWORK)
  const info: unknown = JSON.parse(
    fs.readFileSync(`deployments/${network}.json`, {
      encoding: "utf8",
    }),
  )
  if (!isDeploymentsInfo(info)) {
    throw new Error("Invalid deployments info.")
  }
  const chainId = (await hre.ethers.provider.getNetwork()).chainId
  const deployments = info[chainId]
  if (deployments) {
    return deployments
  } else {
    throw new Error(`Failed to retrieve deployments for chain id: ${chainId}`)
  }
}

function getConfig(configPath: string): MintConfig {
  const config: unknown = JSON.parse(
    fs.readFileSync(configPath, { encoding: "utf8" }),
  )
  if (!isMintConfig(config)) {
    throw new Error("Invalid mint config.")
  }
  return config
}

type ConfigValidationResult = {
  phrasesBytes32: string[]
}

function validateConfig(config: MintConfig): ConfigValidationResult {
  const phrasesBytes32 = config.phrases.map((phrase: string, i: number) => {
    if (!phrase) {
      throw new Error(`Phrase ${i} is empty.`)
    }
    // Validate that phrase, encoded as UTF-8, fits into 32 bytes.
    return hre.ethers.utils.formatBytes32String(phrase)
  })

  // Validate references to new phrases and/or verses by index.
  config.verses.forEach((verse: MintConfigVerse, i: number) => {
    if (!verse.elements.length) {
      throw new Error(`Verse ${i} must not be empty.`)
    }
    if (verse.elements.length === 1) {
      throw new Error(`Verse ${i} must have more than one element.`)
    }
    verse.elements.forEach(
      (verseElement: MintConfigVerseElement, j: number) => {
        switch (verseElement.kind) {
          case "phraseId":
          case "verseId":
            break
          case "newPhraseIndex":
            if (!config.phrases[verseElement.value]) {
              throw new Error(
                `Verse ${i} element ${j} refers to a new phrase by invalid index: ${verseElement.value}`,
              )
            }
            break
          case "newVerseIndex":
            if (!(verseElement.value < i)) {
              throw new Error(
                `Verse ${i} element ${j} refers to a new verse by invalid index: ${verseElement.value}`,
              )
            }
        }
      },
    )
    verse.bases.forEach((verseBase: MintConfigVerseBase, j: number) => {
      switch (verseBase.kind) {
        case "verseId":
          break
        case "newVerseIndex":
          if (!(verseBase.value < i)) {
            throw new Error(
              `Verse ${i} base ${j} refers to a new verse by invalid index: ${verseBase.value}`,
            )
          }
      }
    })
  })

  return {
    phrasesBytes32,
  }
}

type ResolvedPhrase =
  | {
      new: true
      value: string // phraseBytes32
      orig: string
    }
  | {
      new: false
      value: string // phraseId
      orig: string
    }

async function getPhraseContent(
  phrasesContract: Phrases,
  phraseId: string | BigNumber,
  phrasesSupply: BigNumber,
  currentBlock: number,
): Promise<string> {
  const phraseIdStr: string = BigNumber.isBigNumber(phraseId)
    ? phraseId.toString()
    : phraseId
  const phraseBytes32 = await phrasesContract.phrases(phraseId, {
    blockTag: currentBlock,
  })
  const phrase = hre.ethers.utils.parseBytes32String(phraseBytes32)
  if (phraseIdStr === "0") {
    if (phrase !== "") {
      throw new Error("Expected placeholder phrase content to be empty.")
    }
    return "[PLACEHOLDER PHRASE]"
  } else {
    // (No token with id 0 exists, so the highest id of an existent token is
    // equal to the tokens supply.)
    if (BigNumber.from(phraseId).lte(phrasesSupply)) {
      if (phrase === "") {
        throw new Error("Expected content of existent phrase not to be empty.")
      }
      return phrase
    } else {
      if (phrase !== "") {
        throw new Error("Expected content of non-existent phrase to be empty.")
      }
      return `[FUTURE PHRASE ${phraseIdStr}]`
    }
  }
}

const PHRASE_ID_EL_KIND = hre.ethers.utils.keccak256(
  hre.ethers.utils.toUtf8Bytes("PHRASE_ID_EL_KIND"),
)
const VERSE_ID_EL_KIND = hre.ethers.utils.keccak256(
  hre.ethers.utils.toUtf8Bytes("VERSE_ID_EL_KIND"),
)
const NEW_PHRASE_IDX_EL_KIND = hre.ethers.utils.keccak256(
  hre.ethers.utils.toUtf8Bytes("NEW_PHRASE_IDX_EL_KIND"),
)
const NEW_VERSE_IDX_EL_KIND = hre.ethers.utils.keccak256(
  hre.ethers.utils.toUtf8Bytes("NEW_VERSE_IDX_EL_KIND"),
)

async function getVerseContent(
  phrasesContract: Phrases,
  versesContract: Verses,
  verseId: string | BigNumber,
  ancestors: { [verseId: string]: true },
  phrasesSupply: BigNumber,
  versesSupply: BigNumber,
  currentBlock: number,
): Promise<string> {
  const verseIdStr: string = BigNumber.isBigNumber(verseId)
    ? verseId.toString()
    : verseId
  if (verseIdStr in ancestors) {
    return "[INFINITE RECURSION]"
  }

  const verse = await versesContract.getVerse(verseId, {
    blockTag: currentBlock,
  })
  if (verseIdStr === "0") {
    if (verse.elements.length !== 0) {
      throw new Error("Expected placeholder verse to have no elements.")
    }
    if (verse.baseIds.length !== 0) {
      throw new Error("Expected placeholder verse to have no bases.")
    }
    return "[PLACEHOLDER VERSE]"
  } else {
    // (No token with id 0 exists, so the highest id of an existent token is
    // equal to the tokens supply.)
    if (BigNumber.from(verseId).lte(versesSupply)) {
      if (verse.elements.length === 0) {
        throw new Error("Expected existent verse to have elements.")
      }
      const elementsContent: string[] = await Promise.all(
        verse.elements.map((element): Promise<string> => {
          switch (element.kind) {
            case PHRASE_ID_EL_KIND:
              return getPhraseContent(
                phrasesContract,
                element.value,
                phrasesSupply,
                currentBlock,
              )
            case VERSE_ID_EL_KIND:
              return getVerseContent(
                phrasesContract,
                versesContract,
                element.value,
                {
                  ...ancestors,
                  [verseIdStr]: true,
                },
                phrasesSupply,
                versesSupply,
                currentBlock,
              )
            default:
              throw new Error(`Unexpected verse element kind: ${element.kind}`)
          }
        }),
      )
      return elementsContent.join("")
    } else {
      if (verse.elements.length !== 0) {
        throw new Error("Expected non-existent verse to have no elements.")
      }
      if (verse.baseIds.length !== 0) {
        throw new Error("Expected non-existent verse to have no bases.")
      }
      return `[FUTURE VERSE ${verseIdStr}]`
    }
  }
}

async function mint(configPath: string): Promise<void> {
  const config = getConfig(configPath)
  const deployments = await getDeployments()

  const signer = process.env.MINTER_KEY
    ? new hre.ethers.Wallet(process.env.MINTER_KEY)
    : (await hre.ethers.getSigners())[0]
  assertNonNullable(signer)
  console.log("You are signing on chain id:", await signer.getChainId())
  console.log("TODO Do you want to continue?")

  if (process.env.MINTER_KEY) {
    console.log("Using provided MINTER_KEY for address:", signer.address)
  } else {
    console.log(
      "No MINTER_KEY provided. Using default signer address:",
      signer.address,
    )
  }
  console.log("TODO Do you want to continue?")

  const validationResult = validateConfig(config)

  const phrasesContract: Phrases = await hre.ethers.getContractAt(
    PHRASES_CONTRACT_NAME,
    deployments[PHRASES_CONTRACT_NAME].address,
  )
  const versesContract: Verses = await hre.ethers.getContractAt(
    VERSES_CONTRACT_NAME,
    deployments[VERSES_CONTRACT_NAME].address,
  )

  const currentBlockBeforeWrites = await hre.ethers.provider.getBlockNumber()

  const resolvedPhrases: ResolvedPhrase[] = await Promise.all(
    validationResult.phrasesBytes32.map(
      async (phraseBytes32: string, i: number) => {
        const phrase = config.phrases[i]
        assertNonNullable(phrase)

        const phraseId = await phrasesContract.phraseIds(phraseBytes32, {
          blockTag: currentBlockBeforeWrites,
        })
        return phraseId.isZero()
          ? {
              new: true,
              value: phraseBytes32,
              orig: phrase,
            }
          : {
              new: false,
              value: phraseId.toString(),
              orig: phrase,
            }
      },
    ),
  )

  const newPhrases = resolvedPhrases
    .filter((resolved) => resolved.new)
    .map((resolved) => resolved.orig)
  const existingPhrases = resolvedPhrases
    .filter((resolved) => !resolved.new)
    .map((resolved) => resolved.orig)
  console.log("The following phrases will be minted:", newPhrases)
  console.log(
    "The following phrases already exist and will not be minted:",
    existingPhrases,
  )
  console.log("TODO Do you want to proceed?")

  const preparedPhrases: PreparedPhrase[] = resolvedPhrases
    .filter((resolved) => resolved.new)
    .map((resolved) => resolved.value)

  const resolvedVerses: MintConfigVerse[] = config.verses.map((verse) => ({
    elements: verse.elements.map((verseElement): MintConfigVerseElement => {
      if (verseElement.kind === "newPhraseIndex") {
        const resolved = resolvedPhrases[verseElement.value]
        assertNonNullable(resolved)
        if (resolved.new) {
          const preparedIndex = preparedPhrases.findIndex(
            (prepared) => prepared === resolved.value,
          )
          assertFoundIndex(preparedIndex)
          return {
            kind: "newPhraseIndex",
            value: preparedIndex,
          }
        } else {
          return {
            kind: "phraseId",
            value: resolved.value,
          }
        }
      } else {
        return verseElement
      }
    }),
    bases: verse.bases,
    expectedContent: verse.expectedContent,
  }))
  const preparedVerses: PreparedVerse[] = resolvedVerses.map((verse) => ({
    elements: verse.elements.map((verseElement): PreparedVerseElement => {
      switch (verseElement.kind) {
        case "phraseId":
          return {
            kind: PHRASE_ID_EL_KIND,
            value: verseElement.value,
          }
        case "verseId":
          return {
            kind: VERSE_ID_EL_KIND,
            value: verseElement.value,
          }
        case "newPhraseIndex":
          return {
            kind: NEW_PHRASE_IDX_EL_KIND,
            value: verseElement.value.toString(10),
          }
        case "newVerseIndex":
          return {
            kind: NEW_VERSE_IDX_EL_KIND,
            value: verseElement.value.toString(10),
          }
        default:
          return assertUnreachable(verseElement)
      }
    }),
    bases: verse.bases.map((verseBase): PreparedVerseBase => {
      switch (verseBase.kind) {
        case "verseId":
          return {
            kind: VERSE_ID_EL_KIND,
            value: verseBase.value,
          }
        case "newVerseIndex":
          return {
            kind: NEW_VERSE_IDX_EL_KIND,
            value: verseBase.value.toString(10),
          }
        default:
          return assertUnreachable(verseBase)
      }
    }),
  }))

  // TODO If we wanted to absolutely minimize the gas usage of the mint transaction, we could
  // take the `resolvedVerses` that have elements only of kind "phraseId" and "verseId" (i.e. that
  // only use existing phrases and/or verses), and try to further resolve them against existing verses.
  // If we found any existing verses that way, we'd also want to (recursively) resolve the verses
  // that had elements of kind "newVerseId" that used them.

  if (preparedVerses.length) {
    const phrasesSupply = await phrasesContract.totalSupply({
      blockTag: currentBlockBeforeWrites,
    })
    const versesSupply = await versesContract.totalSupply({
      blockTag: currentBlockBeforeWrites,
    })

    const versesContent: string[] = await resolvedVerses.reduce<
      Promise<string[]>
    >(
      async (
        acc: Promise<string[]>,
        curr: MintConfigVerse,
        i: number,
      ): Promise<string[]> => {
        const elementsContent = await Promise.all(
          curr.elements.map(async (element): Promise<string> => {
            switch (element.kind) {
              case "phraseId":
                return getPhraseContent(
                  phrasesContract,
                  element.value,
                  phrasesSupply,
                  currentBlockBeforeWrites,
                )
              case "verseId":
                return getVerseContent(
                  phrasesContract,
                  versesContract,
                  element.value,
                  {},
                  phrasesSupply,
                  versesSupply,
                  currentBlockBeforeWrites,
                )
              case "newPhraseIndex": {
                const phraseBytes32 = preparedPhrases[element.value]
                assertNonNullable(phraseBytes32)
                return hre.ethers.utils.parseBytes32String(phraseBytes32)
              }
              case "newVerseIndex": {
                const verseContent = (await acc)[element.value]
                assertNonNullable(verseContent)
                return verseContent
              }
              default:
                assertUnreachable(element)
            }
          }),
        )
        const verseContent = elementsContent.join("")

        if (verseContent !== curr.expectedContent) {
          throw new Error(
            `Expected content of verse ${i} differs from resolved content of verse to be minted: ${verseContent}`,
          )
        }

        return (await acc).concat([verseContent])
      },
      Promise.resolve([]),
    )

    console.log(
      "Verses containing the following content will be minted:",
      versesContent,
    )
    console.log("TODO Do you want to proceed?")

    const phraseSecrets = preparedPhrases.map(
      () => `0x${randomBytes(32).toString("hex")}`,
    )
    const verseSecrets = preparedVerses.map(
      () => `0x${randomBytes(32).toString("hex")}`,
    )

    console.log(
      "Before minting, we must commit the phrases and/or verses we intend to mint. This helps to prevent front-running.",
    )

    console.log("Secrets of phrase commitments:", phraseSecrets)
    console.log("Secrets of verse commitments:", verseSecrets)

    const phraseCommitments = await Promise.all(
      preparedPhrases.map((preparedPhrase: string, i: number) => {
        const secret = phraseSecrets[i]
        assertNonNullable(secret)
        return phrasesContract.makeCommitment(
          signer.address,
          preparedPhrase,
          secret,
        )
      }),
    )
    const verseCommitments = await Promise.all(
      preparedVerses.map((preparedVerse: PreparedVerse, i: number) => {
        const secret = verseSecrets[i]
        assertNonNullable(secret)
        const protectedValue = hre.ethers.utils.keccak256(
          hre.ethers.utils.defaultAbiCoder.encode(
            ["tuple(bytes32, uint256)[]"],
            [
              preparedVerse.elements.map((element) => [
                element.kind,
                element.value,
              ]),
            ],
          ),
        )
        return versesContract.makeCommitment(
          signer.address,
          protectedValue,
          secret,
        )
      }),
    )

    const [versesMinCommitmentAge, phrasesMinCommitmentAge] = await Promise.all(
      [
        versesContract.MIN_COMMITMENT_AGE({
          blockTag: currentBlockBeforeWrites,
        }),
        phrasesContract.MIN_COMMITMENT_AGE({
          blockTag: currentBlockBeforeWrites,
        }),
      ],
    )
    const minCommitmentAge = versesMinCommitmentAge.gt(phrasesMinCommitmentAge)
      ? versesMinCommitmentAge
      : phrasesMinCommitmentAge

    versesContract.connect(signer)
    const commitResult = await versesContract["commit(bytes32[],bytes32[])"](
      phraseCommitments,
      verseCommitments,
    )
    const commitReceipt = await commitResult.wait()
    console.log(
      `Committed successfully, using ${commitReceipt.gasUsed.toString()} gas.`,
    )

    const sleepSeconds = minCommitmentAge.toNumber() + 1
    assertNonNullable(commitResult.blockNumber)
    await waitFor(sleepSeconds, commitResult.blockNumber)

    const mintResult = await versesContract.mint(
      preparedPhrases,
      phraseSecrets,
      preparedVerses,
      verseSecrets,
    )
    const mintReceipt = await mintResult.wait()
    console.log(
      `Minted successfully, using ${mintReceipt.gasUsed.toString()} gas.`,
    )

    const phrasesMintedEvent = (
      await phrasesContract.queryFilter(
        phrasesContract.filters.PhrasesMinted(signer.address),
        mintResult.blockNumber,
        mintResult.blockNumber,
      )
    ).find((mintedEvent) => mintedEvent.transactionHash === mintResult.hash)
    const versesMintedEvent = (
      await versesContract.queryFilter(
        versesContract.filters.VersesMinted(signer.address),
        mintResult.blockNumber,
        mintResult.blockNumber,
      )
    ).find((mintedEvent) => mintedEvent.transactionHash === mintResult.hash)

    const phrasesMintedIds = phrasesMintedEvent
      ? range(
          phrasesMintedEvent.args.startIdIncl.toNumber(),
          phrasesMintedEvent.args.endIdExcl.toNumber(),
        )
      : []
    console.log("Minted phrase ids:", phrasesMintedIds)

    const phrasesMintedTokenUris = await Promise.all(
      phrasesMintedIds.map((phraseId) => phrasesContract.tokenURI(phraseId)),
    )
    const phraseTokenUrisById = zipObject(
      phrasesMintedIds,
      phrasesMintedTokenUris,
    )
    console.log("Token URIs of minted phrases", phraseTokenUrisById)

    const versesMintedIds = versesMintedEvent
      ? range(
          versesMintedEvent.args.startIdIncl.toNumber(),
          versesMintedEvent.args.endIdExcl.toNumber(),
        )
      : []
    console.log("Minted verse ids:", versesMintedIds)

    const versesMintedTokenUris = await Promise.all(
      versesMintedIds.map((verseId) => versesContract.tokenURI(verseId)),
    )
    const verseTokenUrisById = zipObject(versesMintedIds, versesMintedTokenUris)
    console.log("Token URIs of minted verses", verseTokenUrisById)
  } else {
    const phraseSecrets = preparedPhrases.map(
      () => `0x${randomBytes(32).toString("hex")}`,
    )

    console.log(
      "Before minting, we must commit the phrases we intend to mint. This helps to prevent front-running.",
    )

    console.log("Secrets of phrase commitments:", phraseSecrets)

    const phraseCommitments = await Promise.all(
      preparedPhrases.map((preparedPhrase: string, i: number) => {
        const secret = phraseSecrets[i]
        assertNonNullable(secret)
        return phrasesContract.makeCommitment(
          signer.address,
          preparedPhrase,
          secret,
        )
      }),
    )

    const minCommitmentAge = await phrasesContract.MIN_COMMITMENT_AGE({
      blockTag: currentBlockBeforeWrites,
    })

    phrasesContract.connect(signer)
    const commitResult = await phrasesContract.commit(phraseCommitments)
    const commitReceipt = await commitResult.wait()
    console.log(
      `Committed successfully, using ${commitReceipt.gasUsed.toString()} gas.`,
    )

    const sleepSeconds = minCommitmentAge.toNumber() + 1
    assertNonNullable(commitResult.blockNumber)
    await waitFor(sleepSeconds, commitResult.blockNumber)

    const mintResult = await phrasesContract["mint(bytes32[],bytes32[])"](
      preparedPhrases,
      phraseSecrets,
    )
    const mintReceipt = await mintResult.wait()
    console.log(
      `Minted successfully, using ${mintReceipt.gasUsed.toString()} gas.`,
    )

    const phrasesMintedEvent = (
      await phrasesContract.queryFilter(
        phrasesContract.filters.PhrasesMinted(signer.address),
        mintResult.blockNumber,
        mintResult.blockNumber,
      )
    ).find((mintedEvent) => mintedEvent.transactionHash === mintResult.hash)

    const phrasesMintedIds = phrasesMintedEvent
      ? range(
          phrasesMintedEvent.args.startIdIncl.toNumber(),
          phrasesMintedEvent.args.endIdExcl.toNumber(),
        )
      : []
    console.log("Minted phrase ids:", phrasesMintedIds)

    const phrasesMintedTokenUris = await Promise.all(
      phrasesMintedIds.map((phraseId) => phrasesContract.tokenURI(phraseId)),
    )
    const phraseTokenUrisById = zipObject(
      phrasesMintedIds,
      phrasesMintedTokenUris,
    )
    console.log("Token URIs of minted phrases", phraseTokenUrisById)
  }
}

program
  .version("0.0.0")
  .requiredOption(
    "-c, --config <path>",
    "input JSON file location containing mint config",
  )

program.parse(process.argv)

const options = program.opts()

const configPath: unknown = options.config
assertString(configPath)

assertString(process.env.HARDHAT_NETWORK)

void compile().then(() => {
  void mint(configPath)
})
