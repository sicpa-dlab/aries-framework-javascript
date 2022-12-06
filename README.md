<p align="center">
  <br />
  <img
    alt="Hyperledger Aries logo"
    src="https://raw.githubusercontent.com/hyperledger/aries-framework-javascript/aa31131825e3331dc93694bc58414d955dcb1129/images/aries-logo.png"
    height="250px"
  />
</p>
<h1 align="center"><b>Aries Framework JavaScript</b></h1>
<p align="center">
  <img
    alt="Pipeline Status"
    src="https://github.com/hyperledger/aries-framework-javascript/workflows/Continuous%20Integration/badge.svg?branch=main"
  />
  <a
    href="https://lgtm.com/projects/g/hyperledger/aries-framework-javascript/context:javascript"
    ><img
      alt="Language grade: JavaScript"
      src="https://img.shields.io/lgtm/grade/javascript/g/hyperledger/aries-framework-javascript.svg?logo=lgtm&logoWidth=18"
  /></a>
  <a href="https://codecov.io/gh/hyperledger/aries-framework-javascript/"
    ><img
      alt="Codecov Coverage"
      src="https://img.shields.io/codecov/c/github/hyperledger/aries-framework-javascript/coverage.svg?style=flat-square"
  /></a>
  <a
    href="https://raw.githubusercontent.com/hyperledger/aries-framework-javascript/main/LICENSE"
    ><img
      alt="License"
      src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"
  /></a>
  <a href="https://www.typescriptlang.org/"
    ><img
      alt="typescript"
      src="https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg"
  /></a>
</p>
<br />

<p align="center">
  <a href="#features">Features</a> &nbsp;|&nbsp;
  <a href="#getting-started">Getting started</a> &nbsp;|&nbsp;
  <a href="#contributing">Contributing</a> &nbsp;|&nbsp;
  <a href="#license">License</a> 
</p>

Aries Framework JavaScript is a framework written in TypeScript for building **SSI Agents and DIDComm services** that aims to be **compliant and interoperable** with the standards defined in the [Aries RFCs](https://github.com/hyperledger/aries-rfcs).

## Features

Some features are not yet supported, but are on our roadmap. Check [the roadmap](https://github.com/hyperledger/aries-framework-javascript/issues/39) for more information.

- ✅ React Native
- ✅ Node.JS
- ✅ Report Problem Protocol ([RFC 0035](https://github.com/hyperledger/aries-rfcs/blob/main/features/0035-report-problem/README.md))
- ✅ Issue Credential Protocol ([RFC 0036](https://github.com/hyperledger/aries-rfcs/blob/master/features/0036-issue-credential/README.md))
- ✅ Issue Credential Protocol V2 ([RFC 0453](https://github.com/hyperledger/aries-rfcs/blob/master/features/0453-issue-credential-v2/README.md))
- ✅ Present Proof Protocol ([RFC 0037](https://github.com/hyperledger/aries-rfcs/tree/master/features/0037-present-proof/README.md))
- ✅ Basic Message Protocol ([RFC 0095](https://github.com/hyperledger/aries-rfcs/blob/master/features/0095-basic-message/README.md))
- ✅ Connection Protocol ([RFC 0160](https://github.com/hyperledger/aries-rfcs/blob/master/features/0160-connection-protocol/README.md))
- ✅ Out of Band Protocol ([RFC 0434](https://github.com/hyperledger/aries-rfcs/blob/main/features/0434-outofband/README.md))
- ✅ DID Exchange Protocol ([RFC 0023](https://github.com/hyperledger/aries-rfcs/tree/main/features/0023-did-exchange))
- ✅ Mediator Coordination Protocol ([RFC 0211](https://github.com/hyperledger/aries-rfcs/blob/master/features/0211-route-coordination/README.md))
- ✅ Indy Credentials (with `did:sov` support)
- ✅ HTTP & WebSocket Transport
- ✅ Connection-less Issuance and Verification
- ✅ Smart Auto Acceptance of Connections, Credentials and Proofs
- 🚧 Receiving and Verifying revocable Indy Credentials
- 🚧 W3C Linked Data VCs, BBS+ Signatures
- 🚧 Multi Tenancy
- ❌ Browser

### Packages

<table>
  <tr>
    <th><b>Package</b></th>
    <th><b>Version</b></th>
  </tr>
  <tr>
    <td>@aries-framework/core</td>
    <td>
      <a href="https://npmjs.com/package/@aries-framework/core">
        <img alt="@aries-framework/core version" src="https://img.shields.io/npm/v/@aries-framework/core"/>
      </a>
    </td>
  </tr>
  <tr>
    <td>@aries-framework/node</td>
    <td>
      <a href="https://npmjs.com/package/@aries-framework/node">
        <img alt="@aries-framework/node version" src="https://img.shields.io/npm/v/@aries-framework/node"/>
      </a>
    </td>
  </tr>
  <tr>
    <td>@aries-framework/react-native</td>
    <td>
      <a href="https://npmjs.com/package/@aries-framework/react-native">
        <img alt="@aries-framework/react-native version" src="https://img.shields.io/npm/v/@aries-framework/react-native"/>
      </a>
    </td>
  </tr>
</table>

## Getting Started

Documentation on how to get started with Aries Framework JavaScript can be found at https://aries.js.org

## Publish new packages (SICPA's fork)
See docs [here](sicpa-docs/PUBLISH.md)

### Demo

To get to know the AFJ flow, we built a demo to walk through it yourself together with agents Getter and Faber.

- [Demo](/demo)

### Divergence from Aries RFCs

Although Aries Framework JavaScript tries to follow the standards as described in the Aries RFCs as much as possible, some features in AFJ slightly diverge from the written spec. Below is an overview of the features that diverge from the spec, their impact and the reasons for diverging.

| Feature                                                                                                                                                        | Impact                                                                                                                                                                                                                                                                                                                                                                                                                          | Reason                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Support for `imageUrl` attribute in connection invitation and connection request                                                                               | Properties that are not recognized should be ignored, meaning this shouldn't limit interoperability between agents. As the image url is self-attested it could give a false sense of trust. Better, credential based, method for visually identifying an entity are not present yet.                                                                                                                                            | Even though not documented, almost all agents support this feature. Not including this feature means AFJ is lacking in features in comparison to other implementations. |
| Revocation Notification v1 uses a different `thread_id` format ( `indy::<revocation_registry_id>::<credential_revocation_id>`) than specified in the Aries RFC | Any agents adhering to the [revocation notification v1 RFC](https://github.com/hyperledger/aries-rfcs/tree/main/features/0183-revocation-notification) will not be interoperable with Aries Framework Javascript. However, revocation notification is considered an optional portion of revocation, therefore this will not break core revocation behavior. Ideally agents should use and implement revocation notification v2. | Actual implementations (ACA-Py) of revocation notification v1 so far have implemented this different format, so this format change was made to remain interoperable.    |

## Contributing

If you would like to contribute to the framework, please read the [Framework Developers README](/DEVREADME.md) and the [CONTRIBUTING](/CONTRIBUTING.md) guidelines. These documents will provide more information to get you started!

The Aries Framework JavaScript call takes place every week at Thursday, 14:00 UTC via [Zoom](https://zoom.us/j/92215586249?pwd=Vm5ZTGV4T0cwVEl4blh3MjBzYjVYZz09).
This meeting is for contributors to groom and plan the backlog, and discuss issues.
Meeting agendas and recordings can be found [here](https://wiki.hyperledger.org/display/ARIES/Framework+JS+Meetings).
Feel free to join!

## Comparison with upstream

This document provides key differences between [Sicpa fork](https://github.com/sicpa-dlab/aries-framework-javascript) and [upstream repository](https://github.com/hyperledger/aries-framework-javascript) Aries Frameworks.

### Additions in Sicpa Fork

- [Packages](https://github.com/sicpa-dlab/value-transfer-ui-mobile/tree/main/packages) for NFC and IPC transports.
- DIDComm V2 support:
  - Reworked `Message Sender / Mesasge Receiver` to support both types of messages DIDComm V1 and DIDComm V2.
    - DIDComm V1 has not been tested for a while. It may be broken, but there should not be difficult issues.
    - DIDComm V1 messages are still used for old V1 protocols like connection, issuance, verification. In the future, these protocols potentially can be adopted for DIDComm V2as well.
  - Added `Key Service` - an extra layer for keys generation, management, and storing into collection (Libindy wallet API is used as for other AFJ collections).
    - In the upstream (DIDComm V1) keys are fully managed by Libindy. But libindy does not provide an ability to get private part of a key.
    - In order to integrate DIDComm V2 packing library we have to resolve and pass private part of the keys.
  - Added `DID Service` - managing DIDs. The same reason as for Key Service - for DIDComm V1 DID's are completely managed by Libindy.
- Out-of-Band module - according to DIDComm V2 specification it seems to be a proper way exchange DIDs (create invitations and accept Contacts).
- Connection: DIDComm V1 protocols (like `issuance`, `verification`) depends on the `Conenction` module.
  - There is `Connection` protocol which is used for establishing of secure communication channel between parties.
  - Other protocols requires passing Connection for protocol execution.
  - For DIDComm V2 we just pass DID's directly.
- Message handlers for Value Transfer and Gossip modules for handling our protocols.
- Adopted `Request Mediation` protocol for DIDComm V2.
- Adopted `Trust Ping` protocol for DIDComm V2.

### Important additions in the upstream

- Bugixes:
  - [error if unpacked message does not match JWE structure](https://github.com/hyperledger/aries-framework-javascript/issues/639)
  - [avoid crash when an unexpected message arrives](https://github.com/hyperledger/aries-framework-javascript/issues/1019)
  - [optional fields in did document](https://github.com/hyperledger/aries-framework-javascript/issues/726)
  - [clone record before emitting event](https://github.com/hyperledger/aries-framework-javascript/issues/938)
  - [initial plugin api](https://github.com/hyperledger/aries-framework-javascript/pull/907)
- Features:
  - [Supported Postgres wallet type](https://github.com/hyperledger/aries-framework-javascript/issues/699)
  - [Present proof as nested protocol](https://github.com/hyperledger/aries-framework-javascript/pull/972)
  - [Supported advanced wallet query](https://github.com/hyperledger/aries-framework-javascript/pull/831)
  - [Supported new did document in didcomm message exchange](https://github.com/hyperledger/aries-framework-javascript/issues/609)
  - [add settings to control back off strategy on mediator reconnection](https://github.com/hyperledger/aries-framework-javascript/issues/1017)
  - DIDComm V1 protocols:
    - [Supported Out-of-Band](https://github.com/hyperledger/aries-framework-javascript/pull/717) DIDComm V1 protocol.
    - [Supported Action Menu](https://github.com/hyperledger/aries-rfcs/blob/main/features/0509-action-menu/README.md) DIDComm V1 protocol.
    - [Supported Question Answer](https://github.com/hyperledger/aries-framework-javascript/pull/557) DIDComm V1 protocol.

## License

Hyperledger Aries Framework JavaScript is licensed under the [Apache License Version 2.0 (Apache-2.0)](/LICENSE).
