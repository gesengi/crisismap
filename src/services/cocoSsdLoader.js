/**
 * @file cocoSsdLoader.js
 * @description Dynamic on-device loader for COCO-SSD object detection.
 * Isolates buildings and structures in a photo to improve localized damage assessment.
 */

let cocoSsdModel = null

/**
 * Detects structural boundaries (building, house) in an HTML Image element.
 * @param {HTMLImageElement} imgElement 
 * @returns {Promise<[number, number, number, number] | null>} Bounding box [x, y, width, height] or null if not found.
 */
export async function detectStructure(imgElement) {
  try {
    if (!cocoSsdModel) {
      console.info('[CrisisMap AI] Loading COCO-SSD saved model...')
      // Dynamic import prevents COCO-SSD from bloating the initial bundle size
      const cocoSsd = await import('@tensorflow-models/coco-ssd')
      cocoSsdModel = await cocoSsd.load()
      console.info('[CrisisMap AI] COCO-SSD model loaded successfully.')
    }

    const predictions = await cocoSsdModel.detect(imgElement)
    console.info('[CrisisMap AI] COCO-SSD predictions:', predictions)

    // Filter for architectural classes
    const targetClasses = ['building', 'house']
    const structures = predictions.filter(
      (p) => targetClasses.includes(p.class) && p.score > 0.40
    )

    if (structures.length > 0) {
      // Sort to get the highest confidence bounding box
      structures.sort((a, b) => b.score - a.score)
      const topStructure = structures[0]
      console.info(
        `[CrisisMap AI] Structure isolated: "${topStructure.class}" ` +
        `with score ${topStructure.score.toFixed(3)} at bounding box: [${topStructure.bbox}]`
      )
      return topStructure.bbox // [x, y, width, height]
    }
  } catch (err) {
    console.warn('[CrisisMap AI] Object detection failed:', err)
  }
  return null
}
