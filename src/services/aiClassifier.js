/**
 * @file aiClassifier.js
 * @description Advanced client-side AI damage classification using TensorFlow.js.
 * Integrates COCO-SSD building cropping, default MobileNet v2 classification,
 * on-device transfer learning using local neural networks, and IndexedDB model persistence.
 */

import * as tf from '@tensorflow/tfjs'
import { detectStructure } from './cocoSsdLoader'

// ─── Constants ───────────────────────────────────────────────────────────────

const MOBILENET_MODEL_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/mobilenet_v2_1.0_224/model.json'

// Key ImageNet indices representing wreckage or structural elements (unused but kept for reference)
/*
const STRUCTURAL_INDICES = {
  772: { label: 'rubble', baseLevel: 'complete' },
  774: { label: 'ruins', baseLevel: 'complete' },
  808: { label: 'wreckage', baseLevel: 'complete' },
  777: { label: 'scaffolding', baseLevel: 'partial' },
  951: { label: 'brickwork', baseLevel: 'minimal' },
  810: { label: 'slate roof', baseLevel: 'minimal' },
  849: { label: 'tile roof', baseLevel: 'minimal' },
  913: { label: 'window frame', baseLevel: 'minimal' }
}
*/

let loadedModel = null
let customHead = null

/**
 * Load and cache the MobileNet v2 graph model.
 */
async function getModel() {
  if (!loadedModel) {
    console.info('[CrisisMap AI] Loading MobileNet v2 model...')
    loadedModel = await tf.loadGraphModel(MOBILENET_MODEL_URL)
    console.info('[CrisisMap AI] MobileNet v2 model loaded successfully.')
  }
  return loadedModel
}

/**
 * Load the custom classification head from IndexedDB if it exists.
 */
async function loadCustomHead() {
  if (!customHead) {
    try {
      customHead = await tf.loadLayersModel('indexeddb://crisismap-local-model')
      console.info('[CrisisMap AI] Loaded custom fine-tuned model from IndexedDB.')
    } catch {
      // Model not trained yet, ignore error
      customHead = null
    }
  }
  return customHead
}

/**
 * Helper to check if a custom fine-tuned model is active.
 */
export async function isLocalModelActive() {
  const head = await loadCustomHead()
  return !!head
}

/**
 * Helper to load file as HTML Image element.
 */
function loadImage(fileOrString) {
  return new Promise((resolve, reject) => {
    if (typeof fileOrString === 'string') {
      const img = new Image()
      if (fileOrString.startsWith('http')) {
        img.crossOrigin = 'anonymous'
      }
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image from string source'))
      img.src = fileOrString
    } else {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('Failed to load image element'))
        img.src = e.target.result
      }
      reader.onerror = () => reject(new Error('Failed to read image file'))
      reader.readAsDataURL(fileOrString)
    }
  })
}

/**
 * Helper to extract canvas ImageData.
 */
function getImageData(element) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.drawImage(element, 0, 0, 128, 128)
  return ctx.getImageData(0, 0, 128, 128)
}

/**
 * Classify damage level in an image.
 * Uses COCO-SSD to crop to structures, then feeds features to either 
 * the custom local model or the default ImageNet hybrid pipeline.
 */
export async function classifyDamage(imageFile) {
  if (!(imageFile instanceof Blob)) {
    throw new TypeError('classifyDamage expects a File or Blob.')
  }

  const start = performance.now()
  console.info(`[CrisisMap AI] Classifying: "${imageFile.name}" | Size: ${imageFile.size} bytes`)

  try {
    // 1. Initialize TensorFlow.js and load models
    await tf.ready()
    const baseModel = await getModel()
    const head = await loadCustomHead()

    // 2. Decode file to Image element
    const img = await loadImage(imageFile)

    // 3. Run COCO-SSD boundary cropping (Isolate building from background noise)
    let processedSource = img
    let isCropped = false
    let featureLabel = 'Entire image'

    const bbox = await detectStructure(img)
    if (bbox) {
      const [x, y, w, h] = bbox
      if (w > 20 && h > 20) {
        const cropCanvas = document.createElement('canvas')
        cropCanvas.width = w
        cropCanvas.height = h
        const cropCtx = cropCanvas.getContext('2d')
        cropCtx.drawImage(img, x, y, w, h, 0, 0, w, h)
        processedSource = cropCanvas
        isCropped = true
        featureLabel = 'Building crop'
        console.info(`[CrisisMap AI] Applied bounding box crop: [x:${Math.round(x)}, y:${Math.round(y)}, w:${Math.round(w)}, h:${Math.round(h)}]`)
      }
    }

    // 4. Preprocess source (cropped or original) into 224x224 input tensor in [-1, 1] range
    const tensor = tf.tidy(() => {
      const pixels = tf.browser.fromPixels(processedSource)
      const resized = tf.image.resizeBilinear(pixels, [224, 224])
      const normalized = resized.sub(127.5).div(127.5)
      return normalized.expandDims(0)
    })

    // 5. Run inference
    let suggestion = 'none'
    let confidence = 0.5
    let method = ''
    let edgeDensity = 0
    let grayValue = 0

    if (head) {
      // On-Device Transfer Learning Prediction
      method = 'On-Device Custom Model'
      
      const features = baseModel.predict(tensor)
      const customPredictions = head.predict(features)
      const scores = await customPredictions.data()

      features.dispose()
      customPredictions.dispose()
      tensor.dispose()

      let maxIdx = 0
      let maxScore = 0
      for (let i = 0; i < scores.length; i++) {
        if (scores[i] > maxScore) {
          maxScore = scores[i]
          maxIdx = i
        }
      }

      const reverseLabelMap = { 0: 'minimal', 1: 'partial', 2: 'complete' }
      suggestion = reverseLabelMap[maxIdx]
      confidence = maxScore
      featureLabel = `Local Tuning class: ${suggestion}`
    } else {
      // Default ImageNet + Heuristics Pipeline
      method = isCropped ? 'MobileNet + Building Crop' : 'MobileNet + Texture Heuristics'
      
      const predictions = baseModel.predict(tensor)
      const scores = await predictions.data()
      tensor.dispose()
      predictions.dispose()

      // Sort and get top 5 classes
      const topPreds = Array.from(scores)
        .map((score, idx) => ({ score, idx }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      const maxIdx = topPreds[0].idx
      const maxScore = topPreds[0].score

      // Run Sobel edge analysis on cropped/source image
      const imgData = getImageData(processedSource)
      edgeDensity = computeEdgeDensity(imgData)
      grayValue = computeColorGreyness(imgData)

      const IMAGENET_LABELS = {
        449: 'boathouse', 468: 'cab / taxi', 555: 'fire engine', 675: 'moving van',
        698: 'palace / building', 705: 'passenger car', 739: 'pole', 751: 'camera',
        772: 'rubble / debris', 774: 'ruins', 777: 'scaffolding', 792: 'shoji screen',
        808: 'wreckage', 810: 'slate roof', 839: 'suspension bridge', 849: 'tile roof',
        866: 'trailer truck', 880: 'umbrella', 903: 'pier', 913: 'window frame',
        914: 'window shade', 916: 'yurt', 951: 'brickwork / wall', 968: 'fire screen',
        975: 'geyser'
      }

      featureLabel = IMAGENET_LABELS[maxIdx] || `ImageNet Object #${maxIdx}`

      // Check if any disaster classes are in the top 5 predictions
      const disasterIndices = [772, 774, 808, 777] // rubble, ruins, wreckage, scaffolding
      const hasDisasterInTop5 = topPreds.some(p => disasterIndices.includes(p.idx))
      const topDisaster = topPreds.find(p => disasterIndices.includes(p.idx))

      if (hasDisasterInTop5) {
        // Disaster class detected in top 5
        if (disasterIndices.includes(maxIdx)) {
          // If the top class itself is a disaster, it is destroyed
          suggestion = 'destroyed'
          confidence = Math.min(0.99, maxScore + 0.15)
          featureLabel = `debris: ${IMAGENET_LABELS[maxIdx]}`
        } else {
          // Disaster detected in top 5 but not top 1. Check edge density.
          featureLabel = `damaged: ${IMAGENET_LABELS[maxIdx]} (${IMAGENET_LABELS[topDisaster.idx]} secondary)`
          if (edgeDensity > 0.35 && grayValue > 0.60) {
            suggestion = 'destroyed'
            confidence = 0.78
          } else if (edgeDensity > 0.22) {
            suggestion = 'major'
            confidence = 0.70
          } else {
            suggestion = 'minor'
            confidence = 0.60
          }
        }
      } else {
        // No disaster indices in top 5 predictions (likely clean building/scene)
        // Only classify as damaged if there is overwhelming physical evidence (high edges + dusty grey colors)
        if (edgeDensity > 0.55 && grayValue > 0.72) {
          suggestion = 'destroyed'
          confidence = 0.72
          featureLabel = `irregular texture: ${featureLabel}`
        } else if (edgeDensity > 0.40 && grayValue > 0.65) {
          suggestion = 'major'
          confidence = 0.65
          featureLabel = `high texture: ${featureLabel}`
        } else if (edgeDensity > 0.28 && grayValue > 0.55) {
          suggestion = 'minor'
          confidence = 0.58
        } else {
          suggestion = 'none'
          confidence = Math.max(0.92, Math.min(0.99, 1.0 - edgeDensity))
        }
      }
    }

    const processingTime = Math.round(performance.now() - start)
    console.info(`[CrisisMap AI] Classification complete in ${processingTime}ms. Verdict: ${suggestion} (${Math.round(confidence*100)}%)`)

    const finalSuggestion = {
      none: 'minimal',
      minor: 'partial',
      major: 'partial',
      destroyed: 'complete',
      minimal: 'minimal',
      partial: 'partial',
      complete: 'complete'
    }[suggestion] || 'minimal'

    return {
      suggestion: finalSuggestion,
      confidence: Math.round(confidence * 100) / 100,
      processingTime,
      detectedClass: featureLabel,
      method,
      edgeDensity: Math.round(edgeDensity * 100) / 100,
      grayValue: Math.round(grayValue * 100) / 100
    }
  } catch (err) {
    console.warn('[CrisisMap AI] Inference failed, executing backup heuristics:', err)
    
    // Backup heuristics (No TF.js dependencies)
    try {
      const img = await loadImage(imageFile)
      const imgData = getImageData(img)
      const edgeDensity = computeEdgeDensity(imgData)
      const grayValue = computeColorGreyness(imgData)
      
      let suggestion = 'none'
      let confidence = 0.60
      if (edgeDensity > 0.35) {
        suggestion = 'destroyed'
        confidence = 0.72
      } else if (edgeDensity > 0.22) {
        suggestion = 'major'
        confidence = 0.68
      } else if (edgeDensity > 0.12) {
        suggestion = 'minor'
        confidence = 0.60
      } else {
        suggestion = 'none'
        confidence = 0.85
      }

      return {
        suggestion,
        confidence,
        processingTime: Math.round(performance.now() - start),
        detectedClass: 'Fallback Texture filter',
        method: 'Edge Density Filter (Heuristics)',
        edgeDensity: Math.round(edgeDensity * 100) / 100,
        grayValue: Math.round(grayValue * 100) / 100
      }
    } catch (fallbackError) {
      console.error('[CrisisMap AI] Critical backup failure:', fallbackError)
      return {
        suggestion: 'none',
        confidence: 0.50,
        processingTime: Math.round(performance.now() - start),
        detectedClass: 'Unknown',
        method: 'Null Analyzer (Error Fallback)',
        edgeDensity: 0,
        grayValue: 0
      }
    }
  }
}

/**
 * Trains a custom neural network classification head on the client-side.
 * Uses predictions of the base MobileNet model as training feature vectors.
 * 
 * @param {Array<{file: File, label: string}>} dataset - The training samples.
 * @param {Function} [onEpochEnd] - Callback on epoch complete: (epoch, loss, acc) => void
 */
export async function trainLocalModel(dataset, onEpochEnd) {
  if (!dataset || dataset.length === 0) {
    throw new Error('Training dataset is empty.')
  }

  const labelMap = { minimal: 0, partial: 1, complete: 2 }
  console.info(`[CrisisMap AI] Starting transfer learning on-device for ${dataset.length} files...`)

  await tf.ready()
  const baseModel = await getModel()

  const features = []
  const targets = []

  // Extract feature vectors
  let processedCount = 0
  for (const item of dataset) {
    try {
      const img = await loadImage(item.file)
      const tensor = tf.tidy(() => {
        const pixels = tf.browser.fromPixels(img)
        const resized = tf.image.resizeBilinear(pixels, [224, 224])
        const normalized = resized.sub(127.5).div(127.5)
        return normalized.expandDims(0)
      })

      // Get MobileNet feature representation (1001 logits output vector)
      const logits = baseModel.predict(tensor)
      const logitsData = await logits.data()
      
      features.push(Array.from(logitsData))
      
      // One-hot label encoding
      const target = [0, 0, 0]
      target[labelMap[item.label]] = 1
      targets.push(target)

      tensor.dispose()
      logits.dispose()
      processedCount++
    } catch (imageErr) {
      console.warn(`[CrisisMap AI] Skipping image sample due to load or CORS error:`, item.file, imageErr)
    }
  }

  if (processedCount === 0) {
    throw new Error('No valid training images could be loaded. Ensure files are accessible and free from CORS security constraints.')
  }
  
  console.info(`[CrisisMap AI] Successfully preprocessed ${processedCount} of ${dataset.length} samples.`)

  const xs = tf.tensor2d(features)
  const ys = tf.tensor2d(targets)

  // Construct a small trainable classifier head
  const head = tf.sequential()
  head.add(tf.layers.dense({ inputShape: [1001], units: 32, activation: 'relu' }))
  head.add(tf.layers.dense({ units: 3, activation: 'softmax' }))
  
  head.compile({
    optimizer: tf.train.adam(0.005),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  })

  // Fit model in browser
  await head.fit(xs, ys, {
    epochs: 30,
    batchSize: Math.min(8, dataset.length),
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        if (onEpochEnd) {
          onEpochEnd(epoch + 1, logs.loss, logs.acc)
        }
      }
    }
  })

  // Save the custom trained weights to browser's IndexedDB storage
  await head.save('indexeddb://crisismap-local-model')
  console.info('[CrisisMap AI] On-device training completed. Weights saved to IndexedDB.')
  
  // Set global reference
  customHead = head

  xs.dispose()
  ys.dispose()
}

/**
 * Deletes custom model weights from IndexedDB, reverting back to the default AI engine.
 */
export async function resetLocalModel() {
  try {
    await tf.io.removeModel('indexeddb://crisismap-local-model')
    customHead = null
    console.info('[CrisisMap AI] Custom weights successfully deleted.')
    return true
  } catch (err) {
    console.warn('[CrisisMap AI] No custom weights to delete:', err)
    customHead = null
    return false
  }
}

// ─── Canvas Image Processing Helpers ──────────────────────────────────────────

function computeEdgeDensity(imageData) {
  const { data, width, height } = imageData
  const gray = new Uint8Array(width * height)
  
  for (let i = 0; i < data.length; i += 4) {
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }

  let edgeCount = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const gx =
        -gray[idx - width - 1] + gray[idx - width + 1] -
        2 * gray[idx - 1] + 2 * gray[idx + 1] -
        gray[idx + width - 1] + gray[idx + width + 1]
      const gy =
        -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1] +
        gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1]
      
      const magnitude = Math.sqrt(gx * gx + gy * gy)
      if (magnitude > 90) edgeCount++
    }
  }
  return edgeCount / (width * height)
}

function computeColorGreyness(imageData) {
  const { data } = imageData
  let saturationSum = 0
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    
    let s = 0
    if (max !== min) {
      s = l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min)
    }
    saturationSum += s
  }
  const avgSaturation = saturationSum / (data.length / 4)
  return 1 - avgSaturation
}
