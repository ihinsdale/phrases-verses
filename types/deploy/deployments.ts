import every from "lodash/every"
import { isPlainObject, isString } from "../util"

export const PHRASES_CONTRACT_NAME = "Phrases"
export type PHRASES_CONTRACT_NAME = typeof PHRASES_CONTRACT_NAME

export const VERSES_CONTRACT_NAME = "Verses"
export type VERSES_CONTRACT_NAME = typeof VERSES_CONTRACT_NAME

export type ContractDeploymentInfo = {
  address: string
}
export function isContractDeploymentInfo(
  obj: unknown,
): obj is ContractDeploymentInfo {
  return isPlainObject(obj) && isString(obj.address)
}

export type ChainDeploymentsInfo = {
  [PHRASES_CONTRACT_NAME]: ContractDeploymentInfo
  [VERSES_CONTRACT_NAME]: ContractDeploymentInfo
}
export function isChainDeploymentsInfo(
  obj: unknown,
): obj is ChainDeploymentsInfo {
  return (
    isPlainObject(obj) &&
    isContractDeploymentInfo(obj[PHRASES_CONTRACT_NAME]) &&
    isContractDeploymentInfo(obj[VERSES_CONTRACT_NAME])
  )
}

export type DeploymentsInfo = {
  [chainId: string]: ChainDeploymentsInfo
}
export function isDeploymentsInfo(obj: unknown): obj is DeploymentsInfo {
  return (
    isPlainObject(obj) &&
    every(
      obj,
      (val: unknown, key: unknown) =>
        isString(key) && isChainDeploymentsInfo(val),
    )
  )
}
