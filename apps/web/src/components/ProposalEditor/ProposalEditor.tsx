import React, { useState, useEffect, useMemo, useContext, useRef, useCallback } from 'react'
import { Descendant, Node } from 'slate'
import RichTextEditor from './RichTextEditor'
import ActionDialog from './ActionDialog'
import SubmissionDialog from './SubmissionDialog'
import { Button } from '@/components/ui/button'
import type { Action } from '@/types/proposal-editor'
import { Plus, ChevronDown, ChevronUp, Copy } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useEnsResolution } from '@/hooks/useEnsResolution'
import { isAddress, parseEther, parseUnits } from 'viem'
import { useTenderlySimulation } from '@/hooks/useTenderlySimulation'
import { resolveAction, transactionsToActions, type Transaction } from '@/utils/transactions'
import { CHAIN_CONFIG } from '@/config'
import { useQuery } from '@tanstack/react-query'
import { getProposalIdea, normalizeIdeaId } from '@/data/goldsky/governance/getProposalIdeas'
import { useUpdateProposalCandidate } from '@/hooks/transactions/useUpdateProposalCandidate'
import { useUpdateProposal } from '@/hooks/transactions/useUpdateProposal'
import { getProposal } from '@/data/goldsky/governance/getProposal'
import { messageUtils } from '@/utils/message-utils'
import { ToastContext, ToastType } from '@/providers/toast'
import { useNavigate } from 'react-router-dom'
import { isDaoVersion5 } from '@/utils/daoVersion'

interface ProposalEditorProps {
  title: string
  body: Descendant[]
  actions: Action[]
  onTitleChange: (title: string) => void
  onBodyChange: (body: Descendant[]) => void
  onActionsChange: (actions: Action[]) => void
  onSubmit?: (submissionType?: 'proposal' | 'candidate' | 'topic') => void
  onDelete?: () => void
  disabled?: boolean
  submitLabel?: string
  isSubmitting?: boolean
  defaultSubmissionType?: 'proposal' | 'candidate' | 'topic'
  titlePlaceholder?: string
  contentType?: 'proposal' | 'candidate' | 'topic'
  hasHeader?: boolean // When true, removes top padding to account for external header

  // Edit mode props
  mode?: 'create' | 'edit'
  editData?: {
    candidateId?: string
    updateReason?: string
    onUpdateReasonChange?: (reason: string) => void
  }
  // Internal edit mode state (when used as a standalone component)
  candidateId?: string
  proposalId?: string
}

const ProposalEditor: React.FC<ProposalEditorProps> = ({
  title,
  body,
  actions,
  onTitleChange,
  onBodyChange,
  onActionsChange,
  onSubmit,
  onDelete,
  disabled = false,
  submitLabel = 'Continue to submission',
  isSubmitting = false,
  defaultSubmissionType = 'proposal',
  titlePlaceholder = 'Untitled proposal',
  contentType = 'proposal',
  hasHeader = false,
  mode = 'create',
  editData,
  candidateId,
  proposalId,
}) => {
  const { address } = useAccount()
  const { addToast } = useContext(ToastContext)
  const navigate = useNavigate()
  const isVersion5 = isDaoVersion5()

  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false)
  const [isSubmissionDialogOpen, setIsSubmissionDialogOpen] = useState(false)
  const [editingActionIndex, setEditingActionIndex] = useState<number | null>(null)
  const { resolveEnsAddress } = useEnsResolution()
  const [resolvedAddresses, setResolvedAddresses] = useState<Record<string, string>>({})
  const [expandedActions, setExpandedActions] = useState<Set<number>>(new Set())
  const [copiedActions, setCopiedActions] = useState(false)
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Edit mode state
  const [updateReason, setUpdateReason] = useState(editData?.updateReason || '')

  // Internal state for edit mode (when used as standalone component)
  const [internalTitle, setInternalTitle] = useState(title)
  const [internalBody, setInternalBody] = useState(body)
  const [internalActions, setInternalActions] = useState(actions)

  // Use internal state in edit mode, external state in create mode
  const currentTitle = mode === 'edit' ? internalTitle : title
  const currentBody = mode === 'edit' ? internalBody : body
  const currentActions = mode === 'edit' ? internalActions : actions

  // Internal edit mode data loading (when used as standalone component)
  const actualCandidateId = editData?.candidateId || candidateId
  const actualProposalId = proposalId
  const { data: candidate } = useQuery({
    queryKey: ['candidate', actualCandidateId],
    queryFn: () => actualCandidateId ? getProposalIdea(normalizeIdeaId(actualCandidateId)) : null,
    enabled: !!actualCandidateId && mode === 'edit' && !actualProposalId,
  })

  const { data: proposal } = useQuery({
    queryKey: ['proposal', actualProposalId, 'lilnouns'],
    queryFn: () => actualProposalId ? getProposal(actualProposalId, 'lilnouns') : null,
    enabled: !!actualProposalId && mode === 'edit',
  })

  // Update hooks
  const { updateCandidate, state: updateCandidateState, error: updateCandidateError, receipt: updateCandidateReceipt } = useUpdateProposalCandidate()
  const { updateProposal, state: updateProposalState, error: updateProposalError, receipt: updateProposalReceipt } = useUpdateProposal()
  
  // Use appropriate state based on edit type
  const updateState = actualProposalId ? updateProposalState : updateCandidateState
  const updateError = actualProposalId ? updateProposalError : updateCandidateError
  const updateReceipt = actualProposalId ? updateProposalReceipt : updateCandidateReceipt

  // Tenderly simulation hook
  const {
    data: simulationResults,
    isLoading: isSimulating,
    error: simulationError
  } = useTenderlySimulation(contentType !== 'topic' ? currentActions : [])

  // Load candidate data when in edit mode
  useEffect(() => {
    if (mode === 'edit' && candidate && address && !actualProposalId) {
      // Verify user is the proposer
      if (address.toLowerCase() !== candidate.proposerAddress.toLowerCase()) {
        addToast?.({
          content: 'Only the proposer can edit this candidate.',
          type: ToastType.Failure,
        })
        navigate(`/candidates/${actualCandidateId}`)
        return
      }

      // Set title (extract from description)
      const content = candidate.latestVersion.content
      const newTitle = content.title || ''
      setInternalTitle(newTitle)

      // Convert description to rich text
      // Remove title from description if present
      let description = content.description
      if (description.startsWith(`# ${content.title}\n\n`)) {
        description = description.substring(`# ${content.title}\n\n`.length)
      } else if (description.startsWith(`# ${content.title}\n`)) {
        description = description.substring(`# ${content.title}\n`.length)
      }

      // Convert markdown to rich text (simplified - just create paragraph nodes)
      const paragraphs = description.split('\n\n').filter(p => p.trim())
      const newBody: Descendant[] = paragraphs.length > 0
        ? paragraphs.map(p => ({
            type: 'paragraph',
            children: [{ text: p.trim() }]
          } as unknown as Descendant))
        : [{ type: 'paragraph', children: [{ text: '' }] }] as unknown as Descendant[]
      setInternalBody(newBody)

      // Convert transactions to actions using the reverse-engineering function
      const transactions: Transaction[] = []
      for (let i = 0; i < content.targets.length; i++) {
        transactions.push({
          target: content.targets[i],
          value: content.values[i] || '0',
          signature: content.signatures[i] || '',
          calldata: content.calldatas[i] || '0x',
        })
      }

      // Use the transactionsToActions function to properly decode and detect action types
      const newActions = transactionsToActions(transactions, CHAIN_CONFIG.chain.id)
      setInternalActions(newActions)
    }
  }, [mode, candidate, address, actualCandidateId, actualProposalId, addToast, navigate])

  // Load proposal data when in edit mode
  useEffect(() => {
    if (mode === 'edit' && proposal && address && actualProposalId) {
      // Verify user is the proposer
      if (address.toLowerCase() !== proposal.proposerAddress.toLowerCase()) {
        addToast?.({
          content: 'Only the proposer can edit this proposal.',
          type: ToastType.Failure,
        })
        navigate(`/vote/${actualProposalId}`)
        return
      }

      // Verify proposal is updatable
      if (proposal.state !== 'updatable') {
        addToast?.({
          content: 'This proposal is no longer in the updatable period.',
          type: ToastType.Failure,
        })
        navigate(`/vote/${actualProposalId}`)
        return
      }

      // Set title - use proposal.title first, then extract from description if needed
      let description = proposal.description || ''
      let newTitle = proposal.title || ''
      
      // Remove title from description if present (description format: "# Title\n\nDescription")
      if (newTitle && description.startsWith(`# ${newTitle}\n\n`)) {
        description = description.substring(`# ${newTitle}\n\n`.length)
      } else if (newTitle && description.startsWith(`# ${newTitle}\n`)) {
        description = description.substring(`# ${newTitle}\n`.length)
      } else if (!newTitle && description.startsWith('# ')) {
        // Extract title from description if proposal.title is empty
        const firstLineEnd = description.indexOf('\n')
        if (firstLineEnd > 0) {
          newTitle = description.substring(2, firstLineEnd).trim()
          description = description.substring(firstLineEnd + 1).trim()
        }
      }
      
      setInternalTitle(newTitle)

      // Convert markdown to rich text
      const paragraphs = description.split('\n\n').filter(p => p.trim())
      const newBody: Descendant[] = paragraphs.length > 0
        ? paragraphs.map(p => ({
            type: 'paragraph',
            children: [{ text: p.trim() }]
          } as unknown as Descendant))
        : [{ type: 'paragraph', children: [{ text: '' }] }] as unknown as Descendant[]
      setInternalBody(newBody)

      // Convert transactions to actions
      const transactions: Transaction[] = proposal.transactions.map(tx => ({
        target: tx.to,
        value: tx.value.toString(),
        signature: tx.signature,
        calldata: tx.calldata,
      }))

      const newActions = transactionsToActions(transactions, CHAIN_CONFIG.chain.id)
      setInternalActions(newActions)
    }
  }, [mode, proposal, address, actualProposalId, addToast, navigate])

  // Log simulation errors for debugging
  useEffect(() => {
    if (simulationError) {
      console.error('[ProposalEditor] Simulation error:', simulationError)
    }
  }, [simulationError])

  // Handle title change - use direct handlers to avoid instability
  const handleTitleChange = useCallback((newValue: string) => {
    if (mode === 'edit') {
      setInternalTitle(newValue)
    } else {
      onTitleChange(newValue)
    }
  }, [mode, onTitleChange])

  // Auto-resize title textarea when content changes
  useEffect(() => {
    const textarea = titleTextareaRef.current
    if (textarea) {
      // Use requestAnimationFrame to defer resize until after React's render cycle
      const rafId = requestAnimationFrame(() => {
        if (textarea) {
          textarea.style.height = 'auto'
          textarea.style.height = `${textarea.scrollHeight}px`
        }
      })
      return () => cancelAnimationFrame(rafId)
    }
  }, [currentTitle])

  // Handle body change - use direct handlers to avoid instability
  const handleBodyChange = useCallback((newValue: Descendant[]) => {
    if (mode === 'edit') {
      setInternalBody(newValue)
    } else {
      onBodyChange(newValue)
    }
  }, [mode, onBodyChange])

  // Handle actions change - use direct handlers to avoid instability
  const handleActionsChange = useCallback((newActions: Action[]) => {
    if (mode === 'edit') {
      setInternalActions(newActions)
    } else {
      onActionsChange(newActions)
    }
  }, [mode, onActionsChange])

  // Map action index to transaction indices
  // This is needed because one action can create multiple transactions (e.g., streaming payments)
  const actionToTransactionMap = useMemo(() => {
    const map: number[][] = []
    let transactionIndex = 0
    
    for (let i = 0; i < currentActions.length; i++) {
      const action = currentActions[i]
      if (!action) {
        map[i] = []
        continue
      }
      
      // Resolve ENS names in action before calling resolveAction
      let resolvedAction: Action = { ...action }
      if (action.type === 'one-time-payment' || action.type === 'streaming-payment' || action.type === 'treasury-noun-transfer') {
        const target = action.target
        if (target && !isAddress(target)) {
          if (resolvedAddresses[target]) {
            resolvedAction = { ...action, target: resolvedAddresses[target] as `0x${string}` }
          } else {
            // Skip if ENS name not resolved yet - will retry when resolved
            map[i] = []
            continue
          }
        }
      } else if (action.type === 'custom-transaction') {
        const target = action.contractCallTarget
        if (target && !isAddress(target)) {
          if (resolvedAddresses[target]) {
            resolvedAction = { ...action, contractCallTarget: resolvedAddresses[target] as `0x${string}` }
          } else {
            // Skip if ENS name not resolved yet - will retry when resolved
            map[i] = []
            continue
          }
        }
      }
      
      try {
        const transactions = resolveAction(resolvedAction)
        map[i] = []
        for (let j = 0; j < transactions.length; j++) {
          map[i].push(transactionIndex++)
        }
      } catch (error) {
        console.error(`Error resolving action ${i}:`, error, resolvedAction)
        // Skip this action if resolution fails
        map[i] = []
      }
    }
    
    return map
  }, [currentActions, resolvedAddresses])

  // Helper to get simulation status for an action
  const getSimulationStatus = (actionIndex: number): 'idle' | 'simulating' | 'success' | 'error' => {
    if (!simulationResults || isSimulating) {
      return 'simulating'
    }

    const transactionIndices = actionToTransactionMap[actionIndex]
    if (!transactionIndices || transactionIndices.length === 0) {
      return 'idle'
    }

    // Check if all transactions for this action succeeded
    const allResults = transactionIndices.map(idx => simulationResults[idx])
    if (allResults.every(r => r && r.success)) {
      return 'success'
    }
    if (allResults.some(r => r && !r.success)) {
      return 'error'
    }

    return 'idle'
  }

  // Helper to get error message for an action
  const getSimulationError = (actionIndex: number): string | undefined => {
    if (!simulationResults) return undefined

    const transactionIndices = actionToTransactionMap[actionIndex]
    if (!transactionIndices) return undefined

    // Find first failed transaction
    for (const idx of transactionIndices) {
      const result = simulationResults[idx]
      if (result && !result.success && result.error) {
        return result.error
      }
    }

    return undefined
  }

  // Resolve ENS names for all action targets
  useEffect(() => {
    const resolveAllAddresses = async () => {
      const newResolvedAddresses: Record<string, string> = {}
      
      for (const action of currentActions) {
        let targetAddress: string | undefined
        
        switch (action.type) {
          case 'one-time-payment':
          case 'streaming-payment':
          case 'treasury-noun-transfer':
            targetAddress = action.target
            break
          case 'custom-transaction':
            targetAddress = action.contractCallTarget
            break
        }
        
        if (targetAddress && !isAddress(targetAddress)) {
          try {
            const resolved = await resolveEnsAddress(targetAddress)
            newResolvedAddresses[targetAddress] = resolved
          } catch (error) {
            console.warn(`Failed to resolve ENS name: ${targetAddress}`, error)
          }
        }
      }
      
      setResolvedAddresses(newResolvedAddresses)
    }
    
    if (currentActions.length > 0) {
      resolveAllAddresses()
    }
  }, [currentActions, resolveEnsAddress])

  const handleAddAction = () => {
    setEditingActionIndex(null)
    setIsActionDialogOpen(true)
  }

  const handleEditAction = (index: number) => {
    setEditingActionIndex(index)
    setIsActionDialogOpen(true)
  }

  const handleActionSubmit = (action: Action) => {
    if (editingActionIndex !== null) {
      // Update existing action
      const newActions = [...currentActions]
      newActions[editingActionIndex] = action
      handleActionsChange(newActions)
    } else {
      // Add new action
      handleActionsChange([...currentActions, action])
    }
    setIsActionDialogOpen(false)
    setEditingActionIndex(null)
  }

  const handleBulkActionSubmit = (importedActions: Action[]) => {
    // Add all imported actions to existing actions
    handleActionsChange([...currentActions, ...importedActions])
    setIsActionDialogOpen(false)
    setEditingActionIndex(null)
  }

  const handleActionDelete = () => {
    if (editingActionIndex !== null) {
      const newActions = currentActions.filter((_, i) => i !== editingActionIndex)
      handleActionsChange(newActions)
      setEditingActionIndex(null)
    }
  }

  const handleSubmissionDialogSubmit = (submissionType: 'proposal' | 'candidate' | 'topic') => {
    if (mode === 'edit') {
      // Handle edit mode submission
      handleEditSubmit()
    } else {
      // Handle create mode submission
    onSubmit?.(submissionType)
  }
  }

  const handleEditSubmit = async () => {
    if (!address) return

    if (!updateReason.trim()) {
      addToast?.({
        content: 'Please provide a reason for the update.',
        type: ToastType.Failure,
      })
      return
    }

    try {
      // Convert body (Descendant[]) to markdown string
      const bodyMarkdown = messageUtils.descendantsToMarkdown(currentBody as any)

      if (actualProposalId && proposal) {
        // Update proposal
        const finalTitle = currentTitle || proposal.title
        await updateProposal(
          proposal,
          finalTitle,
          bodyMarkdown,
          currentActions,
          updateReason,
        )
      } else if (candidate) {
      // Update candidate
        const finalTitle = currentTitle || candidate.latestVersion.content.title
      await updateCandidate(
        candidate,
        finalTitle,
        bodyMarkdown,
        currentActions,
        updateReason,
      )
      }
    } catch (error) {
      console.error('Failed to update:', error)
      addToast?.({
        content: `Failed to update: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: ToastType.Failure,
      })
    }
  }

  // Handle successful update
  useEffect(() => {
    if (mode === 'edit' && updateState === 'success' && updateReceipt) {
      if (actualProposalId && proposal) {
        addToast?.({
          content: 'Proposal updated successfully!',
          type: ToastType.Success,
        })
        navigate(`/vote/${actualProposalId}`)
      } else if (candidate) {
      addToast?.({
        content: 'Candidate updated successfully!',
        type: ToastType.Success,
      })
      navigate(`/candidates/${actualCandidateId}`)
    }
    }
  }, [mode, updateState, updateReceipt, candidate, proposal, actualCandidateId, actualProposalId, addToast, navigate])

  const toggleActionExpanded = (index: number) => {
    const newExpanded = new Set(expandedActions)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedActions(newExpanded)
  }

  const getActionSummary = (action: Action): string => {
    try {
      switch (action.type) {
        case 'one-time-payment':
          if (!action.target || !action.amount) return 'Invalid payment action'
          return `Transfer ${action.amount} ${action.currency?.toUpperCase() || 'ETH'} to ${action.target.slice(0, 6)}...${action.target.slice(-4)}`
        case 'streaming-payment':
          if (!action.target || !action.amount) return 'Invalid streaming payment action'
          return `Stream ${action.amount} ${action.currency?.toUpperCase() || 'ETH'} to ${action.target.slice(0, 6)}...${action.target.slice(-4)}`
        case 'custom-transaction':
          if (!action.contractCallTarget || !action.contractCallSignature) return 'Invalid custom transaction'
          return `Call ${action.contractCallSignature} on ${action.contractCallTarget.slice(0, 6)}...${action.contractCallTarget.slice(-4)}`
        case 'treasury-noun-transfer':
          if (!action.target || !action.nounId) return 'Invalid noun transfer action'
          return `Transfer Noun #${action.nounId} to ${action.target.slice(0, 6)}...${action.target.slice(-4)}`
        default:
          return 'Unknown action'
      }
    } catch (error) {
      console.error('Error generating action summary:', error, action)
      return 'Error displaying action'
    }
  }

  const getActionDetails = (action: Action): { target?: string; value?: string; originalTarget?: string } => {
    try {
      switch (action.type) {
        case 'one-time-payment':
          if (!action.target || !action.amount) {
            return { target: action.target || '', originalTarget: action.target || '', value: '0' }
          }
          try {
            // Parse decimal amount to wei/smallest unit
            const parsedValue = action.currency === 'eth' 
              ? parseEther(action.amount)
              : action.currency === 'usdc'
              ? parseUnits(action.amount, 6) // USDC has 6 decimals
              : parseUnits(action.amount, 18) // WETH has 18 decimals
            return {
              target: action.target,
              originalTarget: action.target,
              value: `${parsedValue.toString()} // ${action.amount} ${action.currency?.toUpperCase() || 'ETH'}`,
            }
          } catch (error) {
            // Fallback if parsing fails
            return {
              target: action.target,
              originalTarget: action.target,
              value: `0 // ${action.amount} ${action.currency?.toUpperCase() || 'ETH'} (parse error)`,
            }
          }
        case 'streaming-payment':
          if (!action.target || !action.amount) {
            return { target: action.target || '', originalTarget: action.target || '', value: '0' }
          }
          try {
            // Parse decimal amount to wei/smallest unit
            const parsedValue = action.currency === 'usdc'
              ? parseUnits(action.amount, 6) // USDC has 6 decimals
              : parseUnits(action.amount, 18) // WETH and others have 18 decimals
            return {
              target: action.target,
              originalTarget: action.target,
              value: `${parsedValue.toString()} // ${action.amount} ${action.currency?.toUpperCase() || 'WETH'}`,
            }
          } catch (error) {
            // Fallback if parsing fails
            return {
              target: action.target,
              originalTarget: action.target,
              value: `0 // ${action.amount} ${action.currency?.toUpperCase() || 'WETH'} (parse error)`,
            }
          }
        case 'custom-transaction':
          return {
            target: action.contractCallTarget || '',
            originalTarget: action.contractCallTarget || '',
            value: action.contractCallValue || '0',
          }
        case 'treasury-noun-transfer':
          return {
            target: action.target || '',
            originalTarget: action.target || '',
            value: '0',
          }
        default:
          return {}
      }
    } catch (error) {
      console.error('Error getting action details:', error, action)
      return { target: '', value: '0' }
    }
  }

  const copyActionsToClipboard = async () => {
    try {
      const actionsJson = JSON.stringify(currentActions, null, 2)
      await navigator.clipboard.writeText(actionsJson)
      setCopiedActions(true)
      setTimeout(() => {
        setCopiedActions(false)
      }, 2000)
    } catch (err) {
      console.error('Failed to copy actions to clipboard:', err)
      alert('Failed to copy to clipboard. Please try again.')
    }
  }

  // Check if body has content
  const bodyHasContent = currentBody.some((node: any) => {
    const text = Node.string(node)
    return text.trim().length > 0
  })

  // Check if any simulations failed
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hasFailedSimulations = useMemo(() => {
    if (!simulationResults) return false
    return simulationResults.some(r => !r.success)
  }, [simulationResults])

  // Check if form is valid for submission
  // Topics don't require actions, proposals and candidates do
  // NOTE: Simulation checks temporarily disabled - submission allowed even if simulations fail
  const isFormValid = contentType === 'topic'
    ? currentTitle.trim().length > 0 && bodyHasContent
    : currentTitle.trim().length > 0 &&
      bodyHasContent && 
      currentActions.length >= 1
      // Temporarily removed: !hasFailedSimulations && !isSimulating

  // Render edit mode header
  const editHeader = mode === 'edit' ? (
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <h1 className="heading-2">
          {actualProposalId ? 'Edit Proposal' : 'Edit Candidate'}
        </h1>
        <Button 
          variant="secondary" 
          onClick={() => {
            if (actualProposalId) {
              navigate(`/vote/${actualProposalId}`)
            } else if (actualCandidateId) {
              navigate(`/candidates/${actualCandidateId}`)
            }
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  ) : null

  // Render sidebar content
  const sidebarContent = (
    <div className="py-5">
        {/* Actions List - Nouns Camp Style */}
        {/* Hide actions section for topics */}
        {contentType !== 'topic' && currentActions.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="uppercase text-sm font-semibold text-gray-500">
              Actions
            </h2>
              <button
                onClick={copyActionsToClipboard}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                title="Copy actions to clipboard"
                disabled={copiedActions}
              >
                <Copy className="w-3 h-3" />
                {copiedActions ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <ol className="p-0 m-0 pl-6 list-decimal">
              {currentActions.map((action, index) => {
                if (!action) {
                  console.error('Invalid action at index', index)
                  return null
                }
                
                const details = getActionDetails(action)
                const isExpanded = expandedActions.has(index)

                return (
                  <li key={index} className={index > 0 ? 'mt-6' : ''}>
                    {/* Action Summary */}
                    <div className="text-gray-500 text-sm font-normal">
                      {getActionSummary(action)}
                    </div>

                    {/* Action Controls */}
                    <div className="mt-1.5 flex gap-2">
                      <Button
                        variant="secondary"
                        size="fit"
                        onClick={() => handleEditAction(index)}
                        disabled={disabled}
                        className="h-auto px-2 py-0.5 text-xs bg-white/50 border border-gray-200 text-gray-700"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="fit"
                        onClick={() => toggleActionExpanded(index)}
                        className="h-auto px-2 py-0.5 text-xs bg-white/50 border border-gray-200 text-gray-700"
                      >
                        {isExpanded ? 'Hide' : 'Show'} transaction
                        {isExpanded ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                      </Button>
                    </div>

                    {/* Expanded Transaction Details */}
                    {isExpanded && details.target && (
                      <div className="mt-3">
                        <div className="list-none pl-6 relative">
                          <div className="absolute -left-4 h-7 w-3 border-l border-b border-gray-200 rounded-bl-sm" />
                          <div className="bg-gray-50 p-3 rounded-lg font-mono text-xs relative">
                            <div className="flex items-start mb-2">
                              <span className="text-gray-500 mr-2 flex-shrink-0">target:</span>
                              <span className="break-all flex-1">
                                {details.originalTarget && resolvedAddresses[details.originalTarget]
                                  ? `${resolvedAddresses[details.originalTarget]} (${details.originalTarget})`
                                  : details.target || details.originalTarget || 'N/A'
                                }
                              </span>
                            </div>
                            <div className="flex items-start">
                              <span className="text-gray-500 mr-2 flex-shrink-0">value:</span>
                              <span className="break-all flex-1">{details.value}</span>
                            </div>
                            
                            {/* Simulation Status Indicator */}
                            {(() => {
                              const status = getSimulationStatus(index)
                              
                              if (status === 'simulating') {
                                return (
                                  <div className="absolute top-2 right-2 w-4 h-4 text-gray-400 animate-spin">
                                    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
                                      <circle
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        strokeDasharray="32"
                                        strokeDashoffset="8"
                                      />
                                    </svg>
                                  </div>
                                )
                              }
                              
                              if (status === 'success') {
                                return (
                                  <div className="absolute top-2 right-2 w-4 h-4 text-green-500">
                                    <svg fill="currentColor" viewBox="0 0 20 20">
                                      <path
                                        fillRule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </div>
                                )
                              }
                              
                              if (status === 'error') {
                                return (
                                  <div className="absolute top-2 right-2 w-4 h-4 text-red-500">
                                    <svg fill="currentColor" viewBox="0 0 20 20">
                                      <path
                                        fillRule="evenodd"
                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                  </div>
                                )
                              }
                              
                              return null
                            })()}
                          </div>
                          
                          {/* Simulation Error Message */}
                          {(() => {
                            const error = getSimulationError(index)
                            if (error) {
                              return (
                                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                  <strong>Simulation failed:</strong> {error}
                                </div>
                              )
                            }
                            return null
                          })()}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>

            {/* Add Action Button (in actions list) */}
            <div className="mt-7 pl-6">
              <button
                onClick={handleAddAction}
                disabled={disabled}
                className="w-full px-4 py-3 bg-white/50 border border-gray-200 rounded text-sm text-gray-700 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add action
              </button>
            </div>

          </>
        )}

        {/* Large "Add a proposal action" button when no actions */}
        {/* Hide for topics since they don't need actions */}
        {contentType !== 'topic' && !currentActions.length && (
          <div className="mt-16">
            <button
              onClick={handleAddAction}
              disabled={disabled}
              className="w-full h-24 bg-transparent border-2 border-gray-200 rounded-xl text-lg font-medium text-gray-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add a proposal action
            </button>
          </div>
        )}

    </div>
  )

  // Render sticky footer with submit button
  const stickyFooter = (
    <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
      {mode === 'edit' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Update Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={updateReason}
            onChange={(e) => setUpdateReason(e.target.value)}
            placeholder="Describe the changes you made..."
            className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none bg-white text-gray-900"
            rows={3}
            disabled={disabled || isSubmitting}
          />
        </div>
      )}

      {onSubmit && (
        <button
          onClick={() => {
            if (mode === 'edit') {
              handleEditSubmit()
            } else if (contentType === 'topic') {
              // For topics, directly submit without showing dialog (only if version 5)
              if (isVersion5) {
                onSubmit('topic')
              }
            } else {
              setIsSubmissionDialogOpen(true)
            }
          }}
          disabled={
            disabled || 
            !isFormValid || 
            isSubmitting || 
            (mode === 'edit' && !updateReason.trim()) ||
            (!isVersion5 && (contentType === 'topic' || contentType === 'candidate'))
          }
          className={`w-full px-4 py-4 border-none rounded text-base font-medium transition-all duration-200 ${
            disabled || 
            !isFormValid || 
            isSubmitting || 
            (mode === 'edit' && !updateReason.trim()) ||
            (!isVersion5 && (contentType === 'topic' || contentType === 'candidate'))
              ? 'bg-gray-300 text-gray-400 cursor-not-allowed'
              : 'bg-green-500 text-white cursor-pointer hover:bg-green-600'
          }`}
          title={
            !isVersion5 && (contentType === 'topic' || contentType === 'candidate')
              ? 'This feature is only available in DAO version 5'
              : !isFormValid 
              ? contentType === 'topic'
                ? 'Please add a title and description to continue'
                : 'Please add a title, description, and at least one action to continue'
              : isSubmitting 
              ? contentType === 'topic' ? 'Creating topic...' : 'Submitting proposal...'
              : mode === 'edit' && !updateReason.trim()
              ? 'Please provide an update reason'
              : undefined
          }
        >
          {isSubmitting ? 'Submitting...' : submitLabel}
        </button>
      )}
    </div>
  )

  // Render main content
  const mainContent = (
    <div className="relative w-full max-w-4xl">
      <div className={`flex flex-col xl:pb-64 w-full overflow-hidden ${hasHeader ? 'pt-0' : 'pt-0 sm:pt-24 xl:pt-24'}`}>
        {/* Title */}
        <textarea
          ref={titleTextareaRef}
          placeholder={titlePlaceholder}
          value={currentTitle || ''}
          onChange={(e) => handleTitleChange(e.target.value)}
          disabled={disabled}
          rows={1}
          className="w-full bg-transparent border-none outline-none mb-1 placeholder-gray-400 font-londrina text-6xl md:text-7xl font-normal leading-tight text-gray-900 caret-gray-900 break-words min-w-0 resize-none"
          style={{ 
            wordWrap: 'break-word', 
            overflowWrap: 'break-word',
            overflow: 'hidden'
          }}
        />

        {/* Subtitle */}
        <div className="text-gray-500 text-base mb-6">
          By {address ? (
            <span className="text-gray-500">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
          ) : '0x...'}
        </div>

        {/* Body Editor */}
        <div className="w-full max-w-4xl break-words">
          <RichTextEditor
            value={currentBody}
            onChange={handleBodyChange}
            placeholder='Use markdown shortcuts like "# " and "1. " to create headings and lists.'
            readOnly={disabled}
          />
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-full">
      {/* Edit mode header */}
      {editHeader}

      {/* Unified Layout */}
      <div className="lg:grid lg:grid-cols-[2fr_400px] lg:gap-20 lg:p-8 lg:px-12 lg:w-full">
        
        {/* Main Content Column - Always rendered here */}
        <div className="min-w-0 w-full overflow-hidden break-words px-5 lg:px-0">
          {mainContent}
          
          {/* Mobile bottom spacer to prevent content being hidden behind fixed sidebar */}
          <div className="lg:hidden h-32"></div>
          
          {/* Desktop bottom spacer to ensure consistent spacing between content and footer */}
          <div className="hidden lg:block h-64"></div>
        </div>

        {/* Sidebar Column */}
        {/* Mobile: Fixed bottom drawer */}
        {/* Desktop: Grid column 2, sticky */}
        <div className={`
          fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 
          lg:border-none lg:bg-transparent lg:z-auto
          lg:sticky lg:top-0 lg:max-h-screen lg:overflow-auto lg:self-start
        `}
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }} // Reset padding for desktop, mobile needs override or padding in inner container
        >
          <div className="p-4 lg:p-0 lg:py-5">
            {sidebarContent}
             {/* Show footer here for both layouts now */}
            {stickyFooter}
          </div>
        </div>
        
      </div>

      {/* Action Dialog */}
      <ActionDialog
        isOpen={isActionDialogOpen}
        onClose={() => {
          setIsActionDialogOpen(false)
          setEditingActionIndex(null)
        }}
        onSubmit={handleActionSubmit}
        onBulkSubmit={handleBulkActionSubmit}
        onDelete={editingActionIndex !== null ? handleActionDelete : undefined}
        action={editingActionIndex !== null ? actions[editingActionIndex] : undefined}
        title={editingActionIndex !== null ? 'Edit Action' : 'Add action'}
      />

      {/* Submission Dialog */}
      <SubmissionDialog
        isOpen={isSubmissionDialogOpen}
        onClose={() => setIsSubmissionDialogOpen(false)}
        onSubmit={handleSubmissionDialogSubmit}
        defaultSubmissionType={mode === 'edit' ? 'candidate' : defaultSubmissionType}
        contentType={contentType}
      />

      {/* Error message for edit mode */}
      {mode === 'edit' && updateError && (
        <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 max-w-2xl w-full mx-4 z-30">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {updateError.message}
          </div>
        </div>
      )}
    </div>
  )
}

export default ProposalEditor
