const { seed, connect } = require('./chain/chain');
const { signAndSendTx } = require('./chain/txHandler');

let mintClassInstances = async (classId, startInstanceId, owners) => {
  const { api, signingPair, proxiedAddress } = await connect();

  let instanceId = startInstanceId || 0;
  let txs = [];
  for (let i = 0; i < owners.length; i++) {
    txs.push(api.tx.uniques.mint(classId, instanceId, owners[i]));
    instanceId += 1;
  }

  let txBatch = api.tx.utility.batchAll(txs);
  let call = proxiedAddress
    ? api.tx.proxy.proxy(proxiedAddress, 'Assets', txBatch)
    : txBatch;
  await signAndSendTx(api, call, signingPair);
  console.log(call.toHuman());
};

module.exports = { mintClassInstances };
