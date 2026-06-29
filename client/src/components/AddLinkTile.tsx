import styles from './AddLinkTile.module.css';

interface Props {
  onClick: () => void;
}

export default function AddLinkTile({ onClick }: Props) {
  return (
    <button className={styles.tile} onClick={onClick}>
      <span className={styles.plus}>+</span>
      <span>Add link</span>
    </button>
  );
}
