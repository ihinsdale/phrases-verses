import { ethers, upgrades } from "hardhat"
import fs from "fs"
import {
  PHRASES_CONTRACT_NAME,
  VERSES_CONTRACT_NAME,
} from "../types/deploy/deployments"
import { asNonNullable, assertNonNullable } from "../types/util"

async function main() {
  const [deployer] = await ethers.getSigners()
  assertNonNullable(deployer)

  console.log("Deploying contracts with deployer account:", deployer.address)
  console.log(
    "Deployer account balance:",
    (await deployer.getBalance()).toString(),
  )

  const Phrases = await ethers.getContractFactory(PHRASES_CONTRACT_NAME)
  const phrases = await upgrades.deployProxy(Phrases, [
    PHRASES_CONTRACT_NAME,
    "PHRASE",
    "",
  ])
  await phrases.deployed()

  const Verses = await ethers.getContractFactory(VERSES_CONTRACT_NAME)
  const verses = await upgrades.deployProxy(Verses, [
    VERSES_CONTRACT_NAME,
    "VERSE",
    "",
    phrases.address,
  ])
  await verses.deployed()

  const chainId = (await ethers.provider.getNetwork()).chainId
  const result = {
    [chainId]: {
      [PHRASES_CONTRACT_NAME]: {
        address: phrases.address,
      },
      [VERSES_CONTRACT_NAME]: {
        address: verses.address,
      },
    },
  }
  const network = asNonNullable(process.env.HARDHAT_NETWORK)
  fs.writeFileSync(
    `deployments/${network}.json`,
    JSON.stringify(result, null, 2),
  )

  console.log("Deploy result:", result)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
