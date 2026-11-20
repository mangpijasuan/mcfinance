// No HTTP network, RPC URL, private keys or deployment configuration.
export default {
  networks: {
    lab: { type: 'edr-simulated', chainType: 'l1', chainId: 31337 },
    wrongChain: { type: 'edr-simulated', chainType: 'l1', chainId: 84532 },
  },
}
