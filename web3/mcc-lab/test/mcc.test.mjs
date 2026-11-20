import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import solc from 'solc'
import { BrowserProvider, Contract, ContractFactory, id, parseUnits, ZeroAddress, ZeroHash } from 'ethers'
import { network } from 'hardhat'

const caps = [75n, 10n, 5n, 3n, 2n, 5n].map(n => parseUnits(String(n * 1_000_000_000n), 18))
const TOTAL = caps.reduce((sum, cap) => sum + cap, 0n)
const unit = (n) => parseUnits(String(n), 18)
const filename = 'MCCLabToken.sol'
const source = readFileSync(new URL(`../contracts/${filename}`, import.meta.url), 'utf8')
const compilation = JSON.parse(solc.compile(JSON.stringify({
  language: 'Solidity', sources: { [filename]: { content: source } },
  settings: { evmVersion: 'cancun', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
}), { import: (path) => {
  if (!path.startsWith('@openzeppelin/contracts/') || path.includes('..')) return { error: 'Unsupported import' }
  return { contents: readFileSync(fileURLToPath(new URL(`../node_modules/${path}`, import.meta.url)), 'utf8') }
} }))
assert.deepEqual((compilation.errors ?? []).filter(e => e.severity === 'error'), [])
const artifacts = compilation.contracts[filename]

async function fixture(t, limits = caps, chain = 'lab') {
  const connection = await network.connect(chain)
  t.after(() => connection.close())
  const provider = new BrowserProvider(connection.provider)
  const signers = await Promise.all(Array.from({ length: 8 }, (_, i) => provider.getSigner(i)))
  const issuers = await Promise.all(signers.slice(0, 6).map(s => s.getAddress()))
  const factory = new ContractFactory(artifacts.MCCLabToken.abi, `0x${artifacts.MCCLabToken.evm.bytecode.object}`, signers[6])
  const deploy = async (addresses = issuers, periodLimits = limits) => {
    const token = await factory.deploy(addresses, periodLimits)
    await token.waitForDeployment()
    const minter = new Contract(await token.minter(), artifacts.MCCLabMinter.abi, signers[6])
    return { token, minter }
  }
  return { connection, provider, signers, issuers, deploy, recipient: await signers[7].getAddress() }
}

test('zero initial supply; six hard allocation ceilings sum to the fixed 100B cap', async t => {
  const f = await fixture(t)
  const { token, minter } = await f.deploy()
  assert.equal(await token.symbol(), 'tMCC')
  assert.equal(await token.decimals(), 18n)
  assert.equal(await token.totalSupply(), 0n)
  assert.equal(await token.cap(), TOTAL)
  for (let i = 0; i < 6; i++) {
    assert.equal(await minter.allocationCaps(i), caps[i])
    await (await minter.connect(f.signers[i]).issue(i, f.recipient, caps[i], id(`cap-${i}`))).wait()
    assert.equal(await minter.issued(i), caps[i])
    await assert.rejects(minter.connect(f.signers[i]).issue.staticCall(i, f.recipient, 1n, id(`overflow-${i}`)))
  }
  assert.equal(await token.totalSupply(), TOTAL)
  assert.equal(await token.balanceOf(f.recipient), TOTAL)
})

test('only the assigned bucket issuer can issue; synthetic references cannot be reused', async t => {
  const f = await fixture(t)
  const { token, minter } = await f.deploy()
  const receipt = id('synthetic-1')
  await assert.rejects(token.connect(f.signers[0]).mintLab.staticCall(f.recipient, unit(1)))
  await assert.rejects(minter.connect(f.signers[1]).issue.staticCall(0, f.recipient, unit(1), receipt))
  await assert.rejects(minter.connect(f.signers[0]).issue.staticCall(0, ZeroAddress, unit(1), receipt))
  await assert.rejects(minter.connect(f.signers[0]).issue.staticCall(0, f.recipient, 0n, receipt))
  await assert.rejects(minter.connect(f.signers[0]).issue.staticCall(0, f.recipient, unit(1), ZeroHash))
  await (await minter.connect(f.signers[0]).issue(0, f.recipient, unit(1), receipt)).wait()
  assert.equal(await minter.usedReceipt(receipt), true)
  await assert.rejects(minter.connect(f.signers[1]).issue.staticCall(1, f.recipient, unit(1), receipt))
  assert.equal(await token.totalSupply(), unit(1))
})

test('fixed windows reset period allowance, not lifetime issuance', async t => {
  const f = await fixture(t, caps.map(() => unit(1000)))
  const { token, minter } = await f.deploy()
  const issuer = minter.connect(f.signers[0])
  const period = await minter.currentPeriod()
  await (await issuer.issue(0, f.recipient, unit(1000), id('window-1'))).wait()
  await assert.rejects(issuer.issue.staticCall(0, f.recipient, unit(1), id('window-2')))
  await f.connection.provider.request({ method: 'evm_increaseTime', params: [30 * 86400] })
  await f.connection.provider.request({ method: 'evm_mine', params: [] })
  assert.equal(await minter.currentPeriod(), period + 1n)
  await (await issuer.issue(0, f.recipient, unit(1000), id('window-2'))).wait()
  assert.equal(await minter.issued(0), unit(2000))
  assert.equal(await token.totalSupply(), unit(2000))
  assert.equal(await minter.periodIssued(0, period), unit(1000))
})

test('standard transferable balances and allowance work in the local EVM', async t => {
  const f = await fixture(t)
  const { token, minter } = await f.deploy()
  const owner = token.connect(f.signers[7])
  await (await minter.connect(f.signers[0]).issue(0, f.recipient, unit(10), id('transfer'))).wait()
  await (await owner.transfer(f.issuers[0], unit(2))).wait()
  await (await owner.approve(f.issuers[1], unit(3))).wait()
  await (await token.connect(f.signers[1]).transferFrom(f.recipient, f.issuers[1], unit(3))).wait()
  assert.equal(await token.balanceOf(f.recipient), unit(5))
  assert.equal(await token.balanceOf(f.issuers[0]), unit(2))
  assert.equal(await token.balanceOf(f.issuers[1]), unit(3))
  assert.equal(await token.allowance(f.recipient, f.issuers[1]), 0n)
  assert.equal(await token.totalSupply(), unit(10))
})

test('constructor rejects bad issuer configurations and invalid period limits', async t => {
  const f = await fixture(t)
  await assert.rejects(f.deploy([ZeroAddress, ...f.issuers.slice(1)]))
  await assert.rejects(f.deploy([f.issuers[1], ...f.issuers.slice(1)]))
  await assert.rejects(f.deploy(f.issuers, [0n, ...caps.slice(1)]))
  await assert.rejects(f.deploy(f.issuers, [caps[0] + 1n, ...caps.slice(1)]))
})

test('deployment on a simulated non-local chain ID is rejected', async t => {
  const f = await fixture(t, caps, 'wrongChain')
  assert.equal((await f.provider.getNetwork()).chainId, 84532n)
  await assert.rejects(f.deploy())
})
