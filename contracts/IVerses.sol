// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.9;

import "./ICommitmentProtected.sol";

interface IVerses is ICommitmentProtected {
  struct VerseElement {
    // TODO Consider gas savings of using an enum.
    /// @dev PHRASE_ID_EL_KIND | VERSE_ID_EL_KIND
    bytes32 kind;
    uint256 value;
  }

  struct Relations {
    uint256 size;
    // Array index => verse id
    mapping(uint256 => uint256) verseIds;
  }

  struct Verse {
    // NOTE: For verses that are effectively interpolations of other verses (i.e. because they
    // populate a placeholder phrase / verse), we do not support modeling the verse explicitly
    // as such an interpolation. Doing so would complicate the logic of minting, of the
    // `getVerse()` function, and of hashing a verse to check its uniqueness. The gain in storage
    // efficiency from such a modeling isn't an obvious win, because a verse that has placeholders
    // can always be represented compactly by minimizing the number of non-placeholder verses that
    // it has as elements. So for verses that have placeholders, we may want to nudge the user
    // towards such a compact definition.

    uint256 size;
    mapping(uint256 => VerseElement) elements;
    /// @notice The ids of the verses that this verse extends. The definition of "extends"
    /// is left open to user interpretation: e.g. it could be logical / in terms of data
    /// structure; or describe what inspired the author or what the author sees the verse as
    /// responding to in some sense. Note also that this value is not necessarily exhaustive
    /// of this verse's bases in some sense -- for example, if this verse is effectively an
    /// interpolation of some other verse (because it is identical to the other verse except
    /// that it populates (some of) the other verse's placeholder phrases/verses), there's no
    /// guarantee that this verse will cite the other verse as a base.
    Relations bases;
  }

  struct VerseExternal {
    VerseElement[] elements;
    uint256[] baseIds;
  }

  struct NewVerseElement {
    /// @dev PHRASE_ID_EL_KIND | VERSE_ID_EL_KIND | NEW_PHRASE_IDX_EL_KIND | NEW_VERSE_IDX_EL_KIND
    bytes32 kind;
    uint256 value;
  }

  struct NewVerseBase {
    /// @dev VERSE_ID_EL_KIND | NEW_VERSE_IDX_EL_KIND
    bytes32 kind;
    uint256 value;
  }

  struct NewVerse {
    NewVerseElement[] elements;
    NewVerseBase[] bases;
  }

  function getVerse(uint256 verseId)
    external
    view
    returns (VerseExternal memory);

  function commit(
    bytes32[] calldata _phraseCommitments,
    bytes32[] calldata _verseCommitments
  ) external;

  function mint(
    bytes32[] calldata newPhrases,
    bytes32[] calldata phraseSecrets,
    NewVerse[] memory newVerses,
    bytes32[] calldata verseSecrets
  ) external;

  function getContent(uint256 tokenId) external view returns (string memory);

  event VersesMinted(
    address indexed recipient,
    uint256 startIdIncl,
    uint256 endIdExcl
  );
}
