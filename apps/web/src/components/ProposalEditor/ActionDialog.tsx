import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Action } from '@/types/proposal-editor'
import { cn } from '@/utils/shadcn'
import { useTokenPrices, formatUsdConversion } from '@/hooks/useTokenPrices'
import { parseActionsFromJSON } from '@/utils/action-json-parser'
import { FileJson, AlertCircle } from 'lucide-react'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogContentInner,
  DrawerDialogTitle,
  DrawerDialogDescription,
} from "../ui/DrawerDialog"

interface ActionDialogProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (action: Action) => void
  onDelete?: () => void
  action?: Action
  title?: string
  onBulkSubmit?: (actions: Action[]) => void
}

type ActionType = 'one-time-payment' | 'streaming-payment' | 'custom-transaction' | 'treasury-noun-transfer'

const ActionDialog: React.FC<ActionDialogProps> = ({
  isOpen,
  onClose,
  onSubmit,
  onDelete,
  action,
  title = 'Add Action',
  onBulkSubmit,
}) => {
  const [actionType, setActionType] = useState<ActionType>('one-time-payment')
  const [formData, setFormData] = useState<any>({
    target: '',
    amount: '',
    currency: 'eth',
    contractCallTarget: '',
    contractCallSignature: '',
    contractCallArguments: '',
    contractCallValue: '0',
    nounId: '',
    startTimestamp: Date.now(),
    endTimestamp: Date.now() + 86400000 * 30, // 30 days
  })
  const [jsonInput, setJsonInput] = useState('')
  const [jsonErrors, setJsonErrors] = useState<string[]>([])
  const [showJsonImport, setShowJsonImport] = useState(false)
  const { prices } = useTokenPrices()

  // Update currency when switching action types
  useEffect(() => {
    setFormData((prev: typeof formData) => {
      if (actionType === 'streaming-payment' && (prev.currency === 'eth' || !['weth', 'usdc', 'steth', 'reth', 'oeth'].includes(prev.currency))) {
        // Streaming payments don't support ETH, convert to WETH
        return { ...prev, currency: 'weth' }
      } else if (actionType === 'one-time-payment' && !['eth', 'weth', 'usdc', 'steth', 'reth', 'oeth'].includes(prev.currency)) {
        // Reset to eth if invalid currency for one-time payment
        return { ...prev, currency: 'eth' }
      }
      return prev
    })
  }, [actionType])

  useEffect(() => {
    if (action) {
      setActionType(action.type as ActionType)
      // If editing a streaming payment with 'eth', convert to 'weth'
      if (action.type === 'streaming-payment' && (action as any).currency === 'eth') {
        setFormData({ ...action, currency: 'weth' } as any)
      } else {
        setFormData(action as any)
      }
    } else {
      // Reset form when opening without an action
      // Default currency depends on action type
      const defaultCurrency = actionType === 'streaming-payment' ? 'weth' : 'eth'
      setFormData({
        target: '',
        amount: '',
        currency: defaultCurrency,
        contractCallTarget: '',
        contractCallSignature: '',
        contractCallArguments: '',
        contractCallValue: '0',
        nounId: '',
        startTimestamp: Date.now(),
        endTimestamp: Date.now() + 86400000 * 30,
      })
    }
  }, [action, isOpen, actionType])

  const handleSubmit = () => {
    let actionData: Action

    switch (actionType) {
      case 'one-time-payment':
        actionData = {
          type: 'one-time-payment',
          target: formData.target,
          amount: formData.amount,
          currency: formData.currency as 'eth' | 'weth' | 'usdc' | 'steth' | 'reth' | 'oeth',
        }
        break
      case 'streaming-payment':
        // Convert 'eth' to 'weth' for streaming payments (ETH not supported)
        const streamingCurrency = formData.currency === 'eth' ? 'weth' : formData.currency
        if (!['weth', 'usdc', 'steth', 'reth', 'oeth'].includes(streamingCurrency)) {
          alert('Streaming payments only support WETH, USDC, stETH, rETH, or OETH. ETH is not supported.')
          return
        }
        actionData = {
          type: 'streaming-payment',
          target: formData.target,
          amount: formData.amount,
          currency: streamingCurrency as 'weth' | 'usdc' | 'steth' | 'reth' | 'oeth',
          startTimestamp: formData.startTimestamp,
          endTimestamp: formData.endTimestamp,
          predictedStreamContractAddress: '0x0000000000000000000000000000000000000000', // Will be calculated
        }
        break
      case 'custom-transaction':
        let args: any[] = []
        try {
          args = formData.contractCallArguments ? JSON.parse(formData.contractCallArguments) : []
        } catch (e) {
          alert('Invalid JSON for arguments')
          return
        }
        actionData = {
          type: 'custom-transaction',
          contractCallTarget: formData.contractCallTarget,
          contractCallSignature: formData.contractCallSignature,
          contractCallArguments: args,
          contractCallValue: formData.contractCallValue,
        }
        break
      case 'treasury-noun-transfer':
        actionData = {
          type: 'treasury-noun-transfer',
          nounId: formData.nounId,
          target: formData.target,
        }
        break
      default:
        return
    }

    onSubmit(actionData)
    onClose()
  }

  const isValid = () => {
    switch (actionType) {
      case 'one-time-payment':
      case 'streaming-payment':
        return formData.target && formData.amount && parseFloat(formData.amount) > 0
      case 'custom-transaction':
        return formData.contractCallTarget && formData.contractCallSignature
      case 'treasury-noun-transfer':
        return formData.target && formData.nounId
      default:
        return false
    }
  }

  const handleJsonImport = () => {
    setJsonErrors([])

    if (!jsonInput.trim()) {
      setJsonErrors(['Please paste JSON data'])
      return
    }

    const result = parseActionsFromJSON(jsonInput)

    if (!result.success || !result.actions) {
      setJsonErrors(result.errors || ['Failed to parse JSON'])
      return
    }

    // If multiple actions, add them all via bulk submit
    if (result.actions.length > 1) {
      if (onBulkSubmit) {
        onBulkSubmit(result.actions)
        setShowJsonImport(false)
        setJsonInput('')
        setJsonErrors([])
        onClose()
      } else {
        setJsonErrors(['Bulk import requires the onBulkSubmit callback'])
      }
      return
    }

    // Single action - populate the form or submit directly
    const importedAction = result.actions[0]

    // If it's a custom transaction and we're in custom transaction mode, populate the form
    if (importedAction.type === 'custom-transaction' && actionType === 'custom-transaction') {
      setFormData({
        ...formData,
        contractCallTarget: importedAction.contractCallTarget,
        contractCallSignature: importedAction.contractCallSignature,
        contractCallArguments: JSON.stringify(importedAction.contractCallArguments),
        contractCallValue: importedAction.contractCallValue,
      })
      setShowJsonImport(false)
      setJsonInput('')
      setJsonErrors([])
    } else if (importedAction.type === 'custom-transaction') {
      // If not in custom transaction mode, submit directly
      onSubmit(importedAction)
      setShowJsonImport(false)
      setJsonInput('')
      setJsonErrors([])
      onClose()
    } else {
      // For non-custom transaction types, submit directly
      onSubmit(importedAction)
      setShowJsonImport(false)
      setJsonInput('')
      setJsonErrors([])
      onClose()
    }
  }

  return (
    <DrawerDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerDialogContent className="md:max-h-[85vh] md:max-w-[min(95vw,800px)]">
        <VisuallyHidden.Root>
          <DrawerDialogTitle>
            {title}
          </DrawerDialogTitle>
          <DrawerDialogDescription>
            {title === 'Add Action' ? 'Add a new proposal action' : 'Edit proposal action'}
          </DrawerDialogDescription>
        </VisuallyHidden.Root>
        <DrawerDialogContentInner className="p-0 md:flex-row">
          <div className="w-full pl-6 pt-6 heading-1 md:hidden">
            {title}
          </div>
          
          <div className="flex w-full flex-auto flex-col gap-6 overflow-visible px-6 pb-6 scrollbar-track-transparent md:h-full md:overflow-y-auto md:px-8 md:pt-12">
            <h2 className="hidden md:block">{title}</h2>
            
            <div className="space-y-4">
            {/* Action Type Selector */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700">Type</Label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as ActionType)}
                className="w-full rounded-xl border-2 border-border-primary bg-white px-4 py-3 text-base focus-visible:border-content-primary focus-visible:outline-none transition-colors"
              >
                <option value="one-time-payment">One-time transfer</option>
                <option value="streaming-payment">Streaming payment</option>
                <option value="custom-transaction">Custom transaction</option>
                <option value="treasury-noun-transfer">Treasury Noun transfer</option>
              </select>
            </div>

          {/* One-time Payment Form */}
          {actionType === 'one-time-payment' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <div className="flex gap-2">
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="flex-1"
                  />
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="rounded-xl border-2 border-border-primary bg-white px-4 py-3 text-base focus-visible:border-content-primary focus-visible:outline-none transition-colors"
                  >
                    <option value="eth">ETH</option>
                    <option value="weth">WETH</option>
                    <option value="usdc">USDC</option>
                    <option value="steth">stETH</option>
                    <option value="reth">rETH</option>
                    <option value="oeth">OETH</option>
                  </select>
                </div>
                {formData.amount && (
                  <div className="text-xs text-gray-500">
                    {formatUsdConversion(formData.amount, formData.currency, prices)}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="target">Receiver account</Label>
                <Input
                  id="target"
                  placeholder="0x..., vitalik.eth"
                  value={formData.target}
                  onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                />
                <p className="text-xs text-gray-500">Specify an Ethereum account address or ENS name</p>
              </div>
            </>
          )}

          {/* Streaming Payment Form */}
          {actionType === 'streaming-payment' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="amount-stream">Amount</Label>
                <div className="flex gap-2">
                  <Input
                    id="amount-stream"
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="flex-1"
                  />
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="rounded-xl border-2 border-border-primary bg-white px-4 py-3 text-base focus-visible:border-content-primary focus-visible:outline-none transition-colors"
                  >
                    <option value="weth">WETH</option>
                    <option value="usdc">USDC</option>
                    <option value="steth">stETH</option>
                    <option value="reth">rETH</option>
                    <option value="oeth">OETH</option>
                  </select>
                </div>
                {formData.amount && (
                  <div className="text-xs text-gray-500">
                    {formatUsdConversion(formData.amount, formData.currency, prices)}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="target-stream">Receiver account</Label>
                <Input
                  id="target-stream"
                  placeholder="0x..., vitalik.eth"
                  value={formData.target}
                  onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start">Start Date</Label>
                  <Input
                    id="start"
                    type="date"
                    value={new Date(formData.startTimestamp).toISOString().split('T')[0]}
                    onChange={(e) => setFormData({ ...formData, startTimestamp: new Date(e.target.value).getTime() })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">End Date</Label>
                  <Input
                    id="end"
                    type="date"
                    value={new Date(formData.endTimestamp).toISOString().split('T')[0]}
                    onChange={(e) => setFormData({ ...formData, endTimestamp: new Date(e.target.value).getTime() })}
                  />
                </div>
              </div>
            </>
          )}

          {/* Custom Transaction Form */}
          {actionType === 'custom-transaction' && (
            <>
              {/* JSON Import Toggle */}
              <div className="border-b pb-4">
                <button
                  type="button"
                  onClick={() => setShowJsonImport(!showJsonImport)}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
                >
                  <FileJson className="w-4 h-4" />
                  {showJsonImport ? 'Hide JSON Import' : 'Import from JSON'}
                </button>
              </div>

              {/* JSON Import Section */}
              {showJsonImport && (
                <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <Label className="mb-1">Paste Action JSON</Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Paste a single action or an array of actions. Multiple actions will be added to your proposal automatically.
                    </p>
                  </div>

                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder='{"type":"custom-transaction","contractCallTarget":"0x...","contractCallSignature":"transfer(address,uint256)","contractCallArguments":["0x...","1000000"],"contractCallValue":"0"}'
                    className="w-full h-32 p-3 border border-gray-300 rounded-md font-mono text-xs resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />

                  {jsonErrors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <ul className="list-disc list-inside space-y-1 text-xs">
                            {jsonErrors.map((error, index) => (
                              <li key={index} className="text-red-700">
                                {error}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Example Format */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-800 font-medium">
                      View JSON format examples
                    </summary>
                    <div className="mt-2 p-3 bg-white border border-gray-200 rounded space-y-3">
                      <div>
                        <p className="text-gray-700 mb-2 font-medium">Supported action types:</p>
                        <ul className="list-disc list-inside space-y-1 text-gray-600 text-[11px]">
                          <li><code className="bg-gray-100 px-1 rounded">one-time-payment</code> - Transfer ETH or tokens</li>
                          <li><code className="bg-gray-100 px-1 rounded">streaming-payment</code> - Stream tokens over time</li>
                          <li><code className="bg-gray-100 px-1 rounded">custom-transaction</code> - Call any contract function</li>
                          <li><code className="bg-gray-100 px-1 rounded">treasury-noun-transfer</code> - Transfer Noun from treasury</li>
                          <li><code className="bg-gray-100 px-1 rounded">payer-top-up</code> - Top up payer contract</li>
                        </ul>
                      </div>

                      <div>
                        <p className="text-gray-700 mb-1 font-medium">Single action example:</p>
                        <pre className="bg-gray-50 p-2 rounded overflow-x-auto text-[10px] leading-tight">
{`{
  "type": "one-time-payment",
  "target": "0x1234...5678",
  "amount": "1.5",
  "currency": "eth"
}`}
                        </pre>
                      </div>

                      <div>
                        <p className="text-gray-700 mb-1 font-medium">Multiple actions example:</p>
                        <pre className="bg-gray-50 p-2 rounded overflow-x-auto text-[10px] leading-tight">
{`[
  {
    "type": "one-time-payment",
    "target": "0x1234...5678",
    "amount": "1.5",
    "currency": "eth"
  },
  {
    "type": "custom-transaction",
    "contractCallTarget": "0xabcd...ef01",
    "contractCallSignature": "transfer(address,uint256)",
    "contractCallArguments": ["0x...", "1000000"],
    "contractCallValue": "0"
  }
]`}
                        </pre>
                      </div>
                    </div>
                  </details>

                  <Button
                    type="button"
                    onClick={handleJsonImport}
                    disabled={!jsonInput.trim()}
                    className={cn(
                      "w-full",
                      !jsonInput.trim()
                        ? "bg-gray-300 text-gray-400 cursor-not-allowed hover:bg-gray-300"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    )}
                  >
                    Import Actions
                  </Button>
                </div>
              )}

              {/* Manual Form Fields */}
              <div className="space-y-2">
                <Label htmlFor="contractTarget">Contract Address</Label>
                <Input
                  id="contractTarget"
                  placeholder="0x..."
                  value={formData.contractCallTarget}
                  onChange={(e) => setFormData({ ...formData, contractCallTarget: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signature">Function Signature</Label>
                <Input
                  id="signature"
                  placeholder="transfer(address,uint256)"
                  value={formData.contractCallSignature}
                  onChange={(e) => setFormData({ ...formData, contractCallSignature: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="arguments">Arguments (JSON Array)</Label>
                <Input
                  id="arguments"
                  placeholder='["0x...", "1000000000000000000"]'
                  value={formData.contractCallArguments}
                  onChange={(e) => setFormData({ ...formData, contractCallArguments: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="value">ETH Value (wei)</Label>
                <Input
                  id="value"
                  placeholder="0"
                  value={formData.contractCallValue}
                  onChange={(e) => setFormData({ ...formData, contractCallValue: e.target.value })}
                />
              </div>
            </>
          )}

          {/* Treasury Noun Transfer Form */}
          {actionType === 'treasury-noun-transfer' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="nounId">Noun ID</Label>
                <Input
                  id="nounId"
                  type="number"
                  placeholder="123"
                  value={formData.nounId}
                  onChange={(e) => setFormData({ ...formData, nounId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="target">Recipient Address</Label>
                <Input
                  id="target"
                  placeholder="0x..."
                  value={formData.target}
                  onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                />
              </div>
            </>
          )}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center mt-6">
              {/* Delete button - only show when editing */}
              {action && onDelete && (
                <Button 
                  variant="negative" 
                  onClick={() => {
                    onDelete()
                    onClose()
                  }}
                  className="text-sm"
                >
                  Delete
                </Button>
              )}
              
              {/* Action buttons */}
              <div className="flex gap-3 ml-auto">
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={!isValid()}>
                  {action ? 'Update' : 'Add'}
                </Button>
              </div>
            </div>
          </div>
        </DrawerDialogContentInner>
      </DrawerDialogContent>
    </DrawerDialog>
  )
}

export default ActionDialog
