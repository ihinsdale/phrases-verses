import { ethers } from "hardhat"

describe("Phrases", function () {
  it("Should deploy successfully", async function () {
    const Phrases = await ethers.getContractFactory("Phrases")
    const phrases = await Phrases.deploy()
    await phrases.deployed()
  })
})

describe("Verses", function () {
  it("Should deploy successfully", async function () {
    const Verses = await ethers.getContractFactory("Verses")
    const verses = await Verses.deploy()
    await verses.deployed()
  })
})
