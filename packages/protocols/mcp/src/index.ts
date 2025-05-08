import { ethers, keccak256 } from 'ethers';
import { MerkleTree } from 'merkletreejs';

export interface MCPConfig {
  supportedChains: string[];
  rpcEndpoints: Record<string, string>;
  bridgeContracts: Record<string, string>;
  merkleRoots: Record<string, string[]>;
}

export class MCPBridge {
  private config: MCPConfig;
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private contracts: Map<string, ethers.Contract> = new Map();

  constructor(config: MCPConfig) {
    this.config = config;
    
    // Initialize providers and contracts
    for (const chain of config.supportedChains) {
      const provider = new ethers.JsonRpcProvider(config.rpcEndpoints[chain]);
      this.providers.set(chain, provider);
      
      const contract = new ethers.Contract(
        config.bridgeContracts[chain],
        [
          'function bridge(address token, uint256 amount, address recipient, uint256 targetChainId) returns (bytes32)',
          'function claim(bytes32 messageHash, address recipient, uint256 amount, address token) returns (bool)',
          'function updateMerkleRoot(bytes32 root)',
          'event TokensBridged(address indexed token, address indexed sender, address indexed recipient, uint256 amount, uint256 targetChainId, bytes32 messageHash)',
          'event TokensClaimed(address indexed token, address indexed recipient, uint256 amount, uint256 sourceChainId, bytes32 messageHash)'
        ],
        provider
      );
      this.contracts.set(chain, contract);
    }
  }

  async sendCrossChainMessage(
    sourceChain: string,
    targetChain: string,
    token: string,
    amount: bigint,
    sender: string,
    recipient: string
  ): Promise<string> {
    const sourceContract = this.contracts.get(sourceChain);
    if (!sourceContract) {
      throw new Error(`Contract not found for chain ${sourceChain}`);
    }

    // Get target chain ID
    const targetChainId = this.config.supportedChains.indexOf(targetChain);
    if (targetChainId === -1) {
      throw new Error(`Target chain ${targetChain} not supported`);
    }

    // Send bridge transaction
    const tx = await sourceContract.bridge(
      token,
      amount,
      recipient,
      targetChainId
    );

    // Wait for transaction and get message hash
    const receipt = await tx.wait();
    const event = receipt.events?.find((e: ethers.LogDescription) => e.name === 'TokensBridged');
    if (!event) {
      throw new Error('Bridge event not found');
    }

    return event.args.messageHash;
  }

  async verifyMessage(
    messageHash: string,
    proof: string[],
    chain: string
  ): Promise<boolean> {
    const merkleRoots = this.config.merkleRoots[chain];
    if (!merkleRoots) {
      throw new Error(`No merkle roots found for chain ${chain}`);
    }

    // Create merkle tree from proof
    
    const leaf = keccak256(messageHash);
    const tree = new MerkleTree(proof.map(p => Buffer.from(p, 'hex')));
    
    // Verify against all known merkle roots
    for (const root of merkleRoots) {
      if (tree.verify(proof, leaf, root)) {
        return true;
      }
    }

    return false;
  }

  async claimTokens(
    targetChain: string,
    messageHash: string,
    recipient: string,
    amount: bigint,
    token: string,
    proof: string[]
  ): Promise<boolean> {
    const targetContract = this.contracts.get(targetChain);
    if (!targetContract) {
      throw new Error(`Contract not found for chain ${targetChain}`);
    }

    // Verify message proof
    const isValid = await this.verifyMessage(messageHash, proof, targetChain);
    if (!isValid) {
      throw new Error('Invalid message proof');
    }

    // Claim tokens
    const tx = await targetContract.claim(
      messageHash,
      recipient,
      amount,
      token
    );

    const receipt = await tx.wait();
    const event = receipt.events?.find((e: ethers.LogDescription) => e.name === 'TokensClaimed');
    if (!event) {
      throw new Error('Claim event not found');
    }

    return true;
  }

  async updateMerkleRoot(
    chain: string,
    root: string
  ): Promise<void> {
    const contract = this.contracts.get(chain);
    if (!contract) {
      throw new Error(`Contract not found for chain ${chain}`);
    }

    await contract.updateMerkleRoot(root);
    
    // Update local merkle roots
    if (!this.config.merkleRoots[chain]) {
      this.config.merkleRoots[chain] = [];
    }
    this.config.merkleRoots[chain].push(root);
  }
} 