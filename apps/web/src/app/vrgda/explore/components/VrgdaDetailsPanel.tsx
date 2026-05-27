"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useBuyNounVRGDA } from '@/hooks/transactions/useBuyNounVRGDA';
import { vrgdaSeedToImage } from '@/data/ponder/vrgda/vrgdaSeedToImage';
import { VrgdaPoolSeed } from '@/data/ponder/vrgda/types';
import { Button } from '@/components/ui/button';
import { imageData } from '@/utils/nounImages/imageData';
import { useVrgdaBookmarks } from '@/hooks/useVrgdaBookmarks';
import { formatEther } from 'viem';
import { buildNounTraitImage, buildNounImage } from '@/utils/nounImages/nounImage';
import { NounTraitType } from '@/data/noun/types';
import { getPartNameForTrait } from '@/utils/nounImages/traitNames';
import { useReadContract, usePublicClient } from 'wagmi';
import { CHAIN_CONFIG } from '@/config';

interface VrgdaDetailsPanelProps {
  seed?: VrgdaPoolSeed;
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  allSeeds?: VrgdaPoolSeed[];
  vrgdaPrice?: bigint;
  isCompact?: boolean;
  onClose?: () => void;
}

export const VrgdaDetailsPanel: React.FC<VrgdaDetailsPanelProps> = ({
  seed,
  onPrevious,
  onNext,
  canGoPrevious,
  canGoNext,
  allSeeds,
  vrgdaPrice,
  isCompact = false,
  onClose
}) => {
  const { buyNoun, isLoading: isBuying, error: buyError } = useBuyNounVRGDA();
  const { toggleBookmark, isBookmarkInCurrentPool } = useVrgdaBookmarks(allSeeds);
  const [isCurrentSeedBookmarked, setIsCurrentSeedBookmarked] = useState(false);

  // Contract comparison state
  const [contractSeed, setContractSeed] = useState<{background: number, body: number, accessory: number, head: number, glasses: number} | null>(null);
  const [isLoadingContract, setIsLoadingContract] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const publicClient = usePublicClient();

  // Check if contract is paused
  const { data: isPaused } = useReadContract({
    address: CHAIN_CONFIG.addresses.lilVRGDAProxy,
    abi: [
      {
        type: 'function',
        inputs: [],
        name: 'paused',
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'paused',
  });

  // Check if current seed's blockNumber is in current pool
  const currentPoolBlockNumbers = allSeeds ? allSeeds.map(s => s.blockNumber) : [];
  const isAvailableForPurchase = seed ? currentPoolBlockNumbers.includes(seed.blockNumber) : false;

  // Check bookmark status by filtering localStorage directly
  useEffect(() => {
    if (!seed) {
      setIsCurrentSeedBookmarked(false);
      return;
    }

    try {
      const stored = localStorage.getItem('vrgda-bookmarks');
      if (stored) {
        const data = JSON.parse(stored);
        const bookmarks = data.seeds || [];
        
        // Filter by both nounId and blockNumber to ensure exact match
        const isBookmarked = bookmarks.some((bookmark: any) => 
          bookmark.nounId === seed.nounId && bookmark.blockNumber === seed.blockNumber
        );
        
        setIsCurrentSeedBookmarked(isBookmarked);
      } else {
        setIsCurrentSeedBookmarked(false);
      }
    } catch (error) {
      console.error('Failed to check bookmark status:', error);
      setIsCurrentSeedBookmarked(false);
    }
  }, [seed]);

  if (!seed) return null;

  const handleBuyNow = async () => {
    if (!seed || !isAvailableForPurchase) return;

    try {
      await buyNoun(
        BigInt(seed.blockNumber),
        BigInt(seed.nounId),
        vrgdaPrice
      );
    } catch (error) {
      console.error('Purchase failed:', error);
    }
  };

  // Fetch seed from VRGDA contract for comparison
  // fetchNoun(blockNumber) returns [nounId, seed, svg, price, hash, blockNumber]
  // NOTE: blockhash() only works for last 256 blocks (~50 min), older blocks will revert
  const fetchContractSeed = async () => {
    if (!seed || !publicClient) return;

    setIsLoadingContract(true);
    setContractSeed(null);
    setContractError(null);

    try {
      const vrgdaAddress = CHAIN_CONFIG.addresses.lilVRGDAProxy;

      // Call fetchNoun on the VRGDA contract - only takes blockNumber
      // Returns [nounId, seed, svg, price, hash, blockNumber]
      const result = await publicClient.readContract({
        address: vrgdaAddress,
        abi: [{
          type: 'function',
          name: 'fetchNoun',
          inputs: [
            { name: 'blockNumber', type: 'uint256' }
          ],
          outputs: [
            { name: 'nounId', type: 'uint256' },
            {
              name: 'seed',
              type: 'tuple',
              components: [
                { name: 'background', type: 'uint48' },
                { name: 'body', type: 'uint48' },
                { name: 'accessory', type: 'uint48' },
                { name: 'head', type: 'uint48' },
                { name: 'glasses', type: 'uint48' }
              ]
            },
            { name: 'svg', type: 'string' },
            { name: 'price', type: 'uint256' },
            { name: 'hash', type: 'bytes32' },
            { name: 'blockNum', type: 'uint256' }
          ],
          stateMutability: 'view'
        }],
        functionName: 'fetchNoun',
        args: [BigInt(seed.blockNumber)],
      }) as unknown as readonly [
        bigint,
        { background: bigint | number, body: bigint | number, accessory: bigint | number, head: bigint | number, glasses: bigint | number },
        string,
        bigint,
        string,
        bigint,
      ];

      const [contractNounId, contractSeedResult] = result;

      // Check if nounId matches
      const nounIdMatches = seed.nounId === contractNounId.toString();
      if (!nounIdMatches) {
        console.warn('⚠️ NounId mismatch: Pool has', seed.nounId, 'but contract returns', contractNounId.toString(), 'for block', seed.blockNumber);
      }

      setContractSeed({
        background: Number(contractSeedResult.background),
        body: Number(contractSeedResult.body),
        accessory: Number(contractSeedResult.accessory),
        head: Number(contractSeedResult.head),
        glasses: Number(contractSeedResult.glasses)
      });
      setContractError(null);
      setShowComparison(true);
    } catch (error) {
      console.error('Failed to fetch contract seed:', error);
      // blockhash() only works for last 256 blocks
      setContractError('Block too old (>256 blocks). Cannot verify on-chain.');
      setShowComparison(true);
    } finally {
      setIsLoadingContract(false);
    }
  };

  // Generate image from contract seed
  const contractImageUrl = contractSeed ? buildNounImage({
    background: { seed: contractSeed.background, name: '' },
    body: { seed: contractSeed.body, name: '' },
    accessory: { seed: contractSeed.accessory, name: '' },
    head: { seed: contractSeed.head, name: '' },
    glasses: { seed: contractSeed.glasses, name: '' }
  }, 'full') : null;

  // Check if seeds match
  const seedsMatch = contractSeed && seed ? (
    contractSeed.background === seed.background &&
    contractSeed.body === seed.body &&
    contractSeed.accessory === seed.accessory &&
    contractSeed.head === seed.head &&
    contractSeed.glasses === seed.glasses
  ) : null;

  const fullImageUrl = vrgdaSeedToImage(seed, { imageType: 'full' });
  
  // Get isolated trait images using the same function as filter sidebar
  const traitImages = {
    background: buildNounTraitImage('background' as NounTraitType, seed.background),
    body: buildNounTraitImage('body' as NounTraitType, seed.body),
    accessory: buildNounTraitImage('accessory' as NounTraitType, seed.accessory),
    head: buildNounTraitImage('head' as NounTraitType, seed.head),
    glasses: buildNounTraitImage('glasses' as NounTraitType, seed.glasses)
  };

  // Get background color from noun's background trait
  const backgroundColorHex = imageData.bgcolors[seed.background] || imageData.bgcolors[0];
  const backgroundStyle = { backgroundColor: `#${backgroundColorHex}` };

  return (
    <motion.div layout className="border-border flex h-full w-full flex-col border-l overflow-hidden">
      <div className="flex h-full flex-col transition-colors duration-300 overflow-y-auto pb-4" style={backgroundStyle}>
        {/* VRGDA Noun Image(s) - Pool vs Contract comparison */}
        <div className="relative">
          <div className={`flex ${showComparison && (contractImageUrl || contractError) ? 'gap-1' : ''}`}>
            {/* Pool Image */}
            <div className="relative flex-1">
              <img
                src={fullImageUrl ?? "/noun-loading-skull.gif"}
                alt={`Pool Noun ${seed.blockNumber}`}
                className={`mx-auto object-cover ${
                  showComparison && (contractImageUrl || contractError)
                    ? (isCompact ? 'size-[100px]' : 'size-[144px]')
                    : (isCompact ? 'size-[200px]' : 'size-[288px]')
                }`}
              />
              {showComparison && (contractImageUrl || contractError) && (
                <div className="text-center text-xs font-bold bg-black/50 text-white py-0.5">
                  POOL
                </div>
              )}
            </div>

            {/* Contract Image (when comparison active) */}
            {showComparison && contractImageUrl && (
              <div className="relative flex-1">
                <img
                  src={contractImageUrl}
                  alt={`Contract Noun ${seed.blockNumber}`}
                  className={`mx-auto object-cover ${
                    isCompact ? 'size-[100px]' : 'size-[144px]'
                  }`}
                />
                <div className="text-center text-xs font-bold bg-black/50 text-white py-0.5">
                  CONTRACT
                </div>
              </div>
            )}

            {/* Error message when block too old */}
            {showComparison && contractError && !contractImageUrl && (
              <div className="relative flex-1 flex items-center justify-center bg-gray-200" style={{
                width: isCompact ? '100px' : '144px',
                height: isCompact ? '100px' : '144px'
              }}>
                <div className="text-center p-2">
                  <div className="text-2xl mb-1">⚠️</div>
                  <div className="text-xs text-gray-600 font-medium">
                    {contractError}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Match/Mismatch indicator */}
          {showComparison && seedsMatch !== null && (
            <div className={`text-center text-xs font-bold py-1 ${
              seedsMatch ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
            }`}>
              {seedsMatch ? '✓ SEEDS MATCH' : '✗ SEEDS DO NOT MATCH'}
            </div>
          )}

          {/* Error indicator */}
          {showComparison && contractError && (
            <div className="text-center text-xs font-bold py-1 bg-yellow-500 text-black">
              ⚠️ Cannot verify - block too old
            </div>
          )}

          {/* Compare Button */}
          <div className="absolute top-2 left-2">
            <motion.button
              onClick={() => {
                if (showComparison) {
                  setShowComparison(false);
                  setContractSeed(null);
                  setContractError(null);
                } else {
                  fetchContractSeed();
                }
              }}
              disabled={isLoadingContract}
              className={`px-2 py-1 rounded-full shadow-lg text-xs font-bold transition-colors ${
                showComparison
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Compare with contract seed"
            >
              {isLoadingContract ? '...' : showComparison ? 'Hide' : 'Compare'}
            </motion.button>
          </div>

          {/* Heart Save Button */}
          <div className="absolute top-2 right-2">
            <motion.button
              onClick={() => {
                toggleBookmark(seed);
                // Immediately update state for instant feedback
                setIsCurrentSeedBookmarked(!isCurrentSeedBookmarked);
              }}
              className={`p-2 rounded-full shadow-lg transition-colors ${
                isCurrentSeedBookmarked
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-white text-gray-600 hover:bg-gray-50 hover:text-red-500'
              }`}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              title={isCurrentSeedBookmarked ? 'Remove from saved' : 'Save noun'}
            >
              <svg
                className="w-5 h-5"
                fill={isCurrentSeedBookmarked ? "currentColor" : "none"}
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={isCurrentSeedBookmarked ? 0 : 2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </motion.button>
          </div>
        </div>

        {/* Navigation Header - Responsive */}
        <div className={`mx-2 flex items-center justify-between rounded-t-2xl shadow-sm bg-black/10 ${
          isCompact ? 'px-2 py-1' : 'px-3 py-2'
        }`}>
          <button
            onClick={onPrevious}
            disabled={!canGoPrevious}
            className={`rounded-full bg-white shadow disabled:opacity-50 hover:bg-gray-50 ${
              isCompact ? 'size-5 text-xs' : 'size-6'
            }`}
          >
            ←
          </button>
          <div className="flex flex-col items-center">
            <h2 className={`font-bold ${isCompact ? 'text-sm' : 'text-lg'}`}>
              VRGDA Lil Noun
            </h2>
            <span className={`text-gray-600 ${isCompact ? 'text-xs' : 'text-xs'}`}>
              Block {seed.blockNumber}
            </span>
          </div>
          <button
            onClick={onNext}
            disabled={!canGoNext}
            className={`rounded-full bg-white shadow disabled:opacity-50 hover:bg-gray-50 ${
              isCompact ? 'size-5 text-xs' : 'size-6'
            }`}
          >
            →
          </button>
        </div>

        {/* VRGDA Information Section - Responsive */}
        <div className={`mx-2 bg-white/20 backdrop-blur-sm rounded-t-none rounded-b-2xl ${
          isCompact ? 'p-2' : 'p-3'
        }`}>
          <div className={`grid grid-cols-2 gap-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
            <div>
              <span className="text-gray-600">Lil Noun ID</span>
              <p className="font-semibold">#{seed.nounId}</p>
            </div>
            <div>
              <span className="text-gray-600">Block Number</span>
              <p className="font-semibold">{seed.blockNumber}</p>
            </div>
            <div>
              <span className="text-gray-600">Block Hash</span>
              <p className="font-mono text-xs">{seed.blockHash ? seed.blockHash.slice(0, 10) + '...' : 'N/A'}</p>
            </div>
            <div>
              <span className="text-gray-600">Generated</span>
              <p className="text-xs">{new Date(Number(seed.generatedAt) * 1000).toLocaleDateString()}</p>
            </div>
          </div>
        </div>

        {/* Buy Now Section - Responsive */}
        <div className={`mx-2 mt-2 bg-white/30 backdrop-blur-sm rounded-2xl shadow-sm ${
          isCompact ? 'p-2' : 'p-3'
        }`}>
          <div className={`flex items-center justify-between ${isCompact ? 'mb-1' : 'mb-2'}`}>
            <span className={`font-bold ${isCompact ? 'text-base' : 'text-lg'}`}>
              {vrgdaPrice ? parseFloat(formatEther(vrgdaPrice)).toFixed(4) : '—'} ETH
            </span>
            <span className={`text-gray-600 ${isCompact ? 'text-xs' : 'text-sm'}`}>VRGDA Price</span>
          </div>
          <Button 
            onClick={handleBuyNow}
            disabled={isBuying || !isAvailableForPurchase || isPaused}
            className={`w-full ${
              !isAvailableForPurchase || isPaused
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700'
            } ${isCompact ? 'text-sm py-1' : ''}`}
          >
            {isPaused ? 'Auctions Paused' : isBuying ? 'Processing...' : !isAvailableForPurchase ? 'Not in Current Pool' : 'Buy Now'}
          </Button>
          {buyError && (
            <p className="text-xs text-red-600 mt-1">{buyError.message}</p>
          )}
        </div>

        {/* Traits List - Responsive */}
        <div className={`flex-grow border-t bg-white/30 backdrop-blur-sm mt-2 mx-2 rounded-t-2xl ${
          isCompact ? 'p-1' : 'p-2'
        }`}>
          <h3 className={`font-semibold mb-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>Traits</h3>
          <ul className={`${isCompact ? 'space-y-0.5' : 'space-y-1'}`}>
            {[
              { category: 'Background', value: seed.background, image: traitImages.background, name: getPartNameForTrait('background', seed.background) },
              { category: 'Body', value: seed.body, image: traitImages.body, name: getPartNameForTrait('body', seed.body) },
              { category: 'Accessory', value: seed.accessory, image: traitImages.accessory, name: getPartNameForTrait('accessory', seed.accessory) },
              { category: 'Head', value: seed.head, image: traitImages.head, name: getPartNameForTrait('head', seed.head) },
              { category: 'Glasses', value: seed.glasses, image: traitImages.glasses, name: getPartNameForTrait('glasses', seed.glasses) }
            ].map((trait, index) => (
              <li
                key={index}
                className={`flex w-full items-center border-b border-gray-200 last:border-b-0 ${
                  isCompact ? 'gap-1 pb-0.5 last:pb-0' : 'gap-2 pb-1 last:pb-0'
                }`}
              >
                <div className={`flex-shrink-0 rounded-md bg-gray-100 flex items-center justify-center ${
                  isCompact 
                    ? (trait.category === 'Glasses' ? 'w-12 h-8' : 'w-8 h-8')
                    : (trait.category === 'Glasses' ? 'w-16 h-12' : 'w-12 h-12')
                }`}>
                  <img
                    src={trait.image}
                    alt={`${trait.category} ${trait.value}`}
                    className="object-contain w-full h-full"
                  />
                </div>
                <div className="flex w-full flex-col">
                  <span className={`text-muted-foreground font-bold uppercase tracking-wide ${
                    isCompact ? 'text-xs' : 'text-xs'
                  }`}>
                    {trait.category}
                  </span>
                  <span className={`font-semibold ${isCompact ? 'text-xs' : 'text-sm'}`}>
                    {trait.name}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
};
