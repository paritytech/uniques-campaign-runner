const fs = require('fs');
const path = require('path');
const { signAndSendTx } = require('../chain/txHandler');
const { WorkflowError } = require('../Errors');

const generateMetadata = async (
  pinataClient,
  name,
  description,
  imageFile,
  videoFile,
  metaPath
) => {
  let metaName;
  // resolve metaPath
  if (metaPath) {
    const { dir, base: metaName } = path.parse(metaPath);
    // make directory if the meta directory does not exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!metaName) {
      throw new Error(`${metaPath} is not a valid file path`);
    }
  } else {
    throw new Error(`A path is required to save the metadata file.`);
  }

  // validate image
  let imagePath;
  if (imageFile) {
    imagePath = path.resolve(imageFile);
    if (!fs.existsSync(imagePath)) {
      throw new WorkflowError(
        `the configured class image path: ${imagePath} does not exist`
      );
    }
    if (!fs.statSync(imagePath)?.isFile()) {
      throw new WorkflowError(
        `the configured image path: ${imagePath} is not a file`
      );
    }
  }

  // validate video
  let videoPath;
  if (videoFile) {
    videoPath = path.resolve(videoFile);
    if (!fs.existsSync(videoPath)) {
      throw new WorkflowError(
        `the configured video path: ${videoPath} does not exist`
      );
    }
    if (!fs.statSync(videoPath)?.isFile()) {
      throw new WorkflowError(
        `the configured video path: ${videoPath} is not a file`
      );
    }
  }

  // pin image
  let imageCid, videoCid;

  if (imageFile) {
    const { name: fname } = path.parse(imagePath);
    imageCid = await pinataClient.pinFile(imagePath, `${fname}.image`, true);
    if (!imageCid) {
      throw new WorkflowError(`failed to pin image.`);
    }
  }

  if (videoFile) {
    const { name: fname } = path.parse(videoPath);
    videoCid = await pinataClient.pinFile(videoPath, `${fname}.video`, true);
    if (!videoCid) {
      throw new WorkflowError(`failed to pin video.`);
    }
  }

  // create metadata
  let metadata = {
    name: name,
    image: imageCid ? `ipfs://ipfs/${imageCid}` : undefined,
    animation_url: videoCid ? `ipfs://ipfs/${videoCid}` : undefined,
    description,
  };

  let metadataStr = JSON.stringify(metadata, null, 2);

  // save metadata in the file
  if (metaPath) {
    fs.writeFileSync(metaPath, metadataStr, { encoding: 'utf8' });
  }

  // pin metadata
  let metaCid;

  // Do NOT use cache for metadata, metadata per instance is unique.
  metaCid = await pinataClient.pinFile(metaPath, `${metaName}`);

  if (!metaCid) {
    throw new WorkflowError(`failed to pin metadata`);
  }

  return { metaCid, imageCid, videoCid };
};

let setMetadataInBatch = async (
  connection,
  classId,
  instanceMetaCids,
  dryRun
) => {
  const { api, signingPair, proxiedAddress } = await connection;

  let txs = [];
  for (let i = 0; i < instanceMetaCids.length; i++) {
    let { instanceId, metaCid } = instanceMetaCids[i];
    txs.push(api.tx.uniques.setMetadata(classId, instanceId, metaCid, false));
  }

  let txBatch = api.tx.utility.batchAll(txs);
  let call = proxiedAddress
    ? api.tx.proxy.proxy(proxiedAddress, 'Assets', txBatch)
    : txBatch;
  await signAndSendTx(api, call, signingPair, true, dryRun);
};

let setCollectionMetadata = async (
  connection,
  classId,
  metadataCid,
  dryRun
) => {
  const { api, signingPair, proxiedAddress } = connection;
  let tx = api.tx.uniques.setCollectionMetadata(classId, metadataCid, false);

  let txCall = proxiedAddress
    ? api.tx.proxy.proxy(proxiedAddress, 'Assets', tx)
    : tx;
  console.log(`sending tx with hash ${tx.toHex()}`);
  await signAndSendTx(api, txCall, signingPair, true, dryRun);
};

const generateAndSetCollectionMetadata = async (
  connection,
  pinataClient,
  classId,
  metadata,
  outputFile
) => {
  let { name, description, imageFile, videoFile } = metadata;
  const { metaCid } = await generateMetadata(
    pinataClient,
    name,
    description,
    imageFile,
    videoFile,
    outputFile
  );

  await setCollectionMetadata(connection, classId, metaCid);

  return metaCid;
};

module.exports = {
  generateAndSetCollectionMetadata,
  setMetadataInBatch,
  generateMetadata,
};
