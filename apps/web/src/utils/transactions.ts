import type { Action } from '@/types/proposal-editor'
import { parseEther, parseUnits, encodeFunctionData, getAddress, decodeAbiParameters, parseAbi, formatEther, formatUnits } from 'viem'
import { contracts, getContractsForChain } from '@/contracts/proposal-contracts'
import { Address } from 'viem'

export interface Transaction {
  target: string
  value: string
  signature: string
  calldata: string
}

/**
 * Get DAO executor address based on chain ID
 */
export function getDaoExecutorAddress(chainId: number): Address {
  const chainContracts = getContractsForChain(chainId)
  return chainContracts.executor.address
}

/**
 * Convert an action to blockchain transactions
 * Some actions may generate multiple transactions
 */
export const resolveAction = (action: Action): Transaction[] => {
  switch (action.type) {
    case 'one-time-payment':
      return resolveOneTimePayment(action)
    case 'streaming-payment':
      return resolveStreamingPayment(action)
    case 'custom-transaction':
      return resolveCustomTransaction(action)
    case 'treasury-noun-transfer':
      return resolveTreasuryNounTransfer(action)
    default:
      throw new Error(`Unknown action type: ${(action as any).type}`)
  }
}

/**
 * Resolve one-time payment action
 */
const resolveOneTimePayment = (action: Extract<Action, { type: 'one-time-payment' }>): Transaction[] => {
  const { target, amount, currency } = action

  if (currency === 'eth') {
    // Direct ETH transfer
    return [
      {
        target,
        value: parseEther(amount).toString(),
        signature: '',
        calldata: '0x',
      },
    ]
  }

  // ERC20 transfer (WETH, USDC, stETH, rETH, or OETH)
  let tokenAddress: string
  let decimals: number
  
  if (currency === 'weth') {
    tokenAddress = contracts['weth-token'].address
    decimals = 18
  } else if (currency === 'usdc') {
    tokenAddress = contracts['usdc-token'].address
    decimals = 6
  } else if (currency === 'steth') {
    tokenAddress = contracts['steth-token'].address
    decimals = 18
  } else if (currency === 'reth') {
    tokenAddress = contracts['reth-token'].address
    decimals = 18
  } else if (currency === 'oeth') {
    tokenAddress = contracts['oeth-token'].address
    decimals = 18
  } else {
    throw new Error(`Unsupported currency: ${currency}`)
  }
  
  const amountInWei = parseUnits(amount, decimals)

  return [
    {
      target: tokenAddress,
      value: '0',
      signature: 'transfer(address,uint256)',
      calldata: encodeFunctionData({
        abi: [
          {
            name: 'transfer',
            type: 'function',
            inputs: [
              { name: 'to', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'transfer',
        args: [target as `0x${string}`, amountInWei],
      }),
    },
  ]
}

/**
 * Resolve streaming payment action
 */
const resolveStreamingPayment = (action: Extract<Action, { type: 'streaming-payment' }>): Transaction[] => {
  const { target, amount, currency, startTimestamp, endTimestamp } = action
  const transactions: Transaction[] = []

  // Determine token address and decimals
  // Convert 'eth' to 'weth' if somehow it got through (shouldn't happen with validation)
  const normalizedCurrency = currency === 'eth' ? 'weth' : currency
  let tokenAddress: string
  let decimals: number
  
  if (normalizedCurrency === 'weth') {
    tokenAddress = contracts['weth-token'].address
    decimals = 18
  } else if (normalizedCurrency === 'usdc') {
    tokenAddress = contracts['usdc-token'].address
    decimals = 6
  } else if (normalizedCurrency === 'steth') {
    tokenAddress = contracts['steth-token'].address
    decimals = 18
  } else if (normalizedCurrency === 'reth') {
    tokenAddress = contracts['reth-token'].address
    decimals = 18
  } else if (normalizedCurrency === 'oeth') {
    tokenAddress = contracts['oeth-token'].address
    decimals = 18
  } else {
    throw new Error(`Unsupported currency for streaming: ${currency}. Supported currencies: WETH, USDC, stETH, rETH, OETH`)
  }
  
  const amountInWei = parseUnits(amount, decimals)

  // 1. Approve stream factory to spend tokens
  transactions.push({
    target: tokenAddress,
    value: '0',
    signature: 'approve(address,uint256)',
    calldata: encodeFunctionData({
      abi: [
        {
          name: 'approve',
          type: 'function',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'approve',
      args: [contracts['stream-factory'].address as `0x${string}`, amountInWei],
    }),
  })

  // 2. Create stream
  transactions.push({
    target: contracts['stream-factory'].address,
    value: '0',
    signature: 'createStream(address,address,uint256,uint256,uint256)',
    calldata: encodeFunctionData({
      abi: [
        {
          name: 'createStream',
          type: 'function',
          inputs: [
            { name: 'token', type: 'address' },
            { name: 'recipient', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'startTime', type: 'uint256' },
            { name: 'endTime', type: 'uint256' },
          ],
          outputs: [],
          stateMutability: 'nonpayable',
        },
      ],
      functionName: 'createStream',
      args: [
        tokenAddress as `0x${string}`,
        target as `0x${string}`,
        amountInWei,
        BigInt(Math.floor(startTimestamp / 1000)),
        BigInt(Math.floor(endTimestamp / 1000)),
      ],
    }),
  })

  return transactions
}

/**
 * Resolve custom transaction action
 */
const resolveCustomTransaction = (action: Extract<Action, { type: 'custom-transaction' }>): Transaction[] => {
  const { contractCallTarget, contractCallSignature, contractCallArguments, contractCallValue } = action

  // Parse the function signature to create ABI
  const match = contractCallSignature.match(/^(\w+)\((.*)\)$/)
  if (!match) {
    throw new Error(`Invalid function signature: ${contractCallSignature}`)
  }

  const [, functionName, paramsStr] = match
  const paramTypes = paramsStr ? paramsStr.split(',').map((s) => s.trim()) : []

  // Validate argument count matches parameter count
  if (contractCallArguments.length !== paramTypes.length) {
    throw new Error(
      `Argument count mismatch: expected ${paramTypes.length} arguments for ${contractCallSignature}, got ${contractCallArguments.length}`
    )
  }

  // Normalize arguments based on their types
  const normalizedArgs = contractCallArguments.map((arg, i) => {
    const paramType = paramTypes[i]
    
    // Handle address types - ensure they're properly formatted
    if (paramType === 'address' || paramType.startsWith('address[')) {
      if (typeof arg === 'string') {
        // Ensure address is checksummed and has 0x prefix
        return getAddress(arg as `0x${string}`)
      }
      return arg
    }
    
    // Handle uint/int types - convert strings to BigInt
    if (paramType.startsWith('uint') || paramType.startsWith('int')) {
      if (typeof arg === 'string') {
        // If it's a hex string, parse it
        if (arg.startsWith('0x')) {
          return BigInt(arg)
        }
        // Otherwise treat as decimal
        return BigInt(arg)
      }
      if (typeof arg === 'number') {
        return BigInt(arg)
      }
      return arg
    }
    
    // Handle bytes types
    if (paramType.startsWith('bytes')) {
      return arg
    }
    
    // For other types, return as-is
    return arg
  })

  // Create minimal ABI for the function
  const abi = [
    {
      name: functionName,
      type: 'function',
      inputs: paramTypes.map((type, i) => ({
        name: `arg${i}`,
        type,
      })),
      outputs: [],
      stateMutability: contractCallValue !== '0' ? 'payable' : 'nonpayable',
    },
  ] as const

  try {
    const calldataWithSelector = encodeFunctionData({
      abi,
      functionName,
      args: normalizedArgs,
    })

    // IMPORTANT: NounsDAOExecutor.executeTransaction() prepends the function selector
    // from the signature to the calldata. So we need to strip the selector from
    // the encoded calldata to avoid double-encoding.
    // The selector is the first 4 bytes (8 hex characters + '0x' = 10 chars)
    const calldataWithoutSelector = ('0x' + calldataWithSelector.slice(10)) as `0x${string}`;

    console.log('[Transaction] Encoded custom transaction:', {
      functionName,
      signature: contractCallSignature,
      paramTypes,
      args: contractCallArguments,
      normalizedArgs,
      calldataWithSelector,
      calldataWithoutSelector,
      calldataLength: calldataWithoutSelector.length
    })

    return [
      {
        target: contractCallTarget,
        value: contractCallValue,
        signature: contractCallSignature,
        calldata: calldataWithoutSelector,
      },
    ]
  } catch (error) {
    console.error('[Transaction] Failed to encode custom transaction:', {
      functionName,
      signature: contractCallSignature,
      paramTypes,
      args: contractCallArguments,
      normalizedArgs,
      error
    })
    throw new Error(`Failed to encode transaction for ${contractCallSignature}: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Resolve treasury noun transfer action
 */
const resolveTreasuryNounTransfer = (action: Extract<Action, { type: 'treasury-noun-transfer' }>): Transaction[] => {
  const { nounId, target } = action

  return [
    {
      target: contracts.token.address,
      value: '0',
      signature: 'transferFrom(address,address,uint256)',
      calldata: encodeFunctionData({
        abi: [
          {
            name: 'transferFrom',
            type: 'function',
            inputs: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'tokenId', type: 'uint256' },
            ],
            outputs: [],
            stateMutability: 'nonpayable',
          },
        ],
        functionName: 'transferFrom',
        args: [contracts.executor.address as `0x${string}`, target as `0x${string}`, BigInt(nounId)],
      }),
    },
  ]
}

/**
 * Convert all actions to transactions (flattened)
 */
export const resolveActions = (actions: Action[]): Transaction[] => {
  console.log('[Transaction] ========================================')
  console.log('[Transaction] Resolving', actions.length, 'actions to transactions')
  console.log('[Transaction] ========================================')
  
  const transactions: Transaction[] = []
  
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    console.log(`[Transaction] Action ${i + 1}:`, {
      type: action.type,
      ...(action.type === 'custom-transaction' ? {
        contractCallTarget: action.contractCallTarget,
        contractCallSignature: action.contractCallSignature,
        contractCallArguments: action.contractCallArguments,
        contractCallValue: action.contractCallValue
      } : action.type === 'one-time-payment' ? {
        target: action.target,
        amount: action.amount,
        currency: action.currency
      } : action.type === 'streaming-payment' ? {
        target: action.target,
        amount: action.amount,
        currency: action.currency,
        duration: action.duration
      } : action.type === 'treasury-noun-transfer' ? {
        nounId: action.nounId,
        target: action.target
      } : {})
    })
    
    const resolved = resolveAction(action)
    
    resolved.forEach((tx, txIndex) => {
      console.log(`[Transaction]   → Transaction ${txIndex + 1} of ${resolved.length}:`, {
        target: tx.target,
        value: tx.value,
        signature: tx.signature,
        calldata: tx.calldata,
        calldataLength: tx.calldata.length,
        calldataPreview: tx.calldata.substring(0, 100) + (tx.calldata.length > 100 ? '...' : '')
      })
    })
    
    transactions.push(...resolved)
  }
  
  console.log('[Transaction] ========================================')
  console.log('[Transaction] Total transactions:', transactions.length)
  console.log('[Transaction] ========================================')
  
  return transactions
}

/**
 * Estimate total ETH value needed for all transactions
 */
export const calculateTotalValue = (transactions: Transaction[]): bigint => {
  return transactions.reduce((total, tx) => total + BigInt(tx.value), 0n)
}

/**
 * Reverse-engineer actions from transactions
 * Attempts to detect action types and decode calldata
 */
export const transactionsToActions = (transactions: Transaction[], chainId: number = 1): Action[] => {
  const actions: Action[] = []
  const chainContracts = getContractsForChain(chainId)
  
  let i = 0
  while (i < transactions.length) {
    const tx = transactions[i]
    
    // Check for ETH transfer (one-time payment)
    if (tx.signature === '' && BigInt(tx.value) > 0n) {
      actions.push({
        type: 'one-time-payment',
        target: getAddress(tx.target),
        amount: formatEther(BigInt(tx.value)),
        currency: 'eth',
      })
      i++
      continue
    }
    
    // Check for ERC20 transfer (one-time payment)
    if (tx.signature === 'transfer(address,uint256)') {
      try {
        // Decode calldata - calldata is stored WITHOUT selector (executor prepends it)
        // decodeAbiParameters can decode just the parameters
        const decoded = decodeAbiParameters(
          [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          tx.calldata as `0x${string}`
        )
        
        const recipient = decoded[0] as Address
        const amount = decoded[1] as bigint
        
        // Determine currency based on token address
        // Note: lido-token address maps to steth since they're the same token
        let currency: 'weth' | 'usdc' | 'steth' | 'reth' | 'oeth' = 'weth'
        let decimals = 18
        
        if (tx.target.toLowerCase() === chainContracts['weth-token'].address.toLowerCase()) {
          currency = 'weth'
          decimals = 18
        } else if (tx.target.toLowerCase() === chainContracts['usdc-token'].address.toLowerCase()) {
          currency = 'usdc'
          decimals = 6
        } else if (
          tx.target.toLowerCase() === chainContracts['steth-token'].address.toLowerCase() ||
          tx.target.toLowerCase() === chainContracts['lido-token'].address.toLowerCase()
        ) {
          // Map both steth-token and lido-token addresses to 'steth' (they're the same token)
          currency = 'steth'
          decimals = 18
        } else if (tx.target.toLowerCase() === chainContracts['reth-token'].address.toLowerCase()) {
          currency = 'reth'
          decimals = 18
        } else if (tx.target.toLowerCase() === chainContracts['oeth-token'].address.toLowerCase()) {
          currency = 'oeth'
          decimals = 18
        }
        
        actions.push({
          type: 'one-time-payment',
          target: recipient,
          amount: formatUnits(amount, decimals),
          currency,
        })
        i++
        continue
      } catch (error) {
        console.warn('Failed to decode ERC20 transfer:', error)
      }
    }
    
    // Check for streaming payment (approve + createStream)
    if (tx.signature === 'approve(address,uint256)' && 
        i + 1 < transactions.length &&
        transactions[i + 1].signature === 'createStream(address,address,uint256,uint256,uint256)') {
      try {
        const approveTx = tx
        const createStreamTx = transactions[i + 1]
        
        // Decode approve to get amount - calldata stored WITHOUT selector
        const approveDecoded = decodeAbiParameters(
          [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          approveTx.calldata as `0x${string}`
        )
        const amount = approveDecoded[1] as bigint
        
        // Decode createStream to get recipient and timestamps - calldata stored WITHOUT selector
        const streamDecoded = decodeAbiParameters(
          [
            { name: 'token', type: 'address' },
            { name: 'recipient', type: 'address' },
            { name: 'amount', type: 'uint256' },
            { name: 'startTime', type: 'uint256' },
            { name: 'endTime', type: 'uint256' },
          ],
          createStreamTx.calldata as `0x${string}`
        )
        
        const recipient = streamDecoded[1] as Address
        const startTimestamp = Number(streamDecoded[3]) * 1000
        const endTimestamp = Number(streamDecoded[4]) * 1000
        
        // Determine currency
        const tokenAddress = streamDecoded[0] as Address
        let currency: 'weth' | 'usdc' = 'weth'
        let decimals = 18
        
        if (tokenAddress.toLowerCase() === chainContracts['usdc-token'].address.toLowerCase()) {
          currency = 'usdc'
          decimals = 6
        }
        
        actions.push({
          type: 'streaming-payment',
          target: recipient,
          amount: formatUnits(amount, decimals),
          currency,
          startTimestamp,
          endTimestamp,
          predictedStreamContractAddress: '0x0000000000000000000000000000000000000000' as `0x${string}`,
        })
        
        i += 2 // Skip both transactions
        continue
      } catch (error) {
        console.warn('Failed to decode streaming payment:', error)
      }
    }
    
    // Check for treasury noun transfer
    if (tx.signature === 'transferFrom(address,address,uint256)' &&
        tx.target.toLowerCase() === chainContracts.token.address.toLowerCase()) {
      try {
        const decoded = decodeAbiParameters(
          [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'tokenId', type: 'uint256' },
          ],
          tx.calldata as `0x${string}`
        )
        
        const recipient = decoded[1] as Address
        const nounId = decoded[2] as bigint
        
        // Verify it's from the executor (treasury)
        if (decoded[0].toLowerCase() === chainContracts.executor.address.toLowerCase()) {
          actions.push({
            type: 'treasury-noun-transfer',
            nounId: nounId.toString(),
            target: recipient,
          })
          i++
          continue
        }
      } catch (error) {
        console.warn('Failed to decode noun transfer:', error)
      }
    }
    
    // Default: treat as custom transaction
    try {
      // Parse signature to get function name and params
      const signatureMatch = tx.signature.match(/^(\w+)\((.*)\)$/)
      if (signatureMatch) {
        const [, functionName, paramsStr] = signatureMatch
        const paramTypes = paramsStr ? paramsStr.split(',').map((s) => s.trim()).filter(s => s.length > 0) : []
        
        // Try to decode calldata - calldata is stored WITHOUT selector
        let decodedArgs: string[] = []
        if (paramTypes.length > 0 && tx.calldata && tx.calldata !== '0x') {
          try {
            // decodeAbiParameters can decode just the parameters (without selector)
            const decoded = decodeAbiParameters(
              paramTypes.map((type, i) => ({ name: `arg${i}`, type })),
              tx.calldata as `0x${string}`
            )
            
            // Convert decoded values to strings
            decodedArgs = decoded.map((value) => {
              if (typeof value === 'bigint') {
                return value.toString()
              }
              if (typeof value === 'string') {
                return value
              }
              return String(value)
            })
          } catch (error) {
            console.warn(`Failed to decode calldata for ${tx.signature}:`, error)
            // Fill with empty strings if decoding fails
            decodedArgs = paramTypes.map(() => '')
          }
        }
        
        actions.push({
          type: 'custom-transaction',
          contractCallTarget: getAddress(tx.target),
          contractCallSignature: tx.signature,
          contractCallArguments: decodedArgs,
          contractCallValue: tx.value,
        })
      } else {
        // Invalid signature, skip
        console.warn(`Invalid signature format: ${tx.signature}`)
      }
    } catch (error) {
      console.warn(`Failed to parse transaction ${i}:`, error)
    }
    
    i++
  }
  
  return actions
}
