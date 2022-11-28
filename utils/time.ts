import hre from "hardhat"
import "@nomiclabs/hardhat-ethers"

import { assertNonNullable } from "../types/util"

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function waitFor(
  seconds: number,
  currentBlock: number,
): Promise<void> {
  if (process.env.HARDHAT_NETWORK === "localhost") {
    assertNonNullable(currentBlock)
    const commitBlock = await hre.ethers.provider.getBlock(currentBlock)
    await hre.ethers.provider.send("evm_setNextBlockTimestamp", [
      commitBlock.timestamp + seconds,
    ])
    await hre.ethers.provider.send("evm_mine", [])
  } else {
    await sleep(seconds * 1000)
  }
}
