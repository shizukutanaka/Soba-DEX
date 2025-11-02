import React from 'react';
import '../../styles/avatar.css';

export interface AvatarProps {
  /** Image source */
  src?: string;
  /** Alt text */
  alt?: string;
  /** Name for fallback initials */
  name?: string;
  /** Size variant */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Shape variant */
  shape?: 'circle' | 'square';
  /** Status indicator */
  status?: 'online' | 'offline' | 'away' | 'busy';
  /** Custom class name */
  className?: string;
}

/**
 * Avatar component for user representation
 * Following Atlassian Design System principles
 */
export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt,
  name,
  size = 'md',
  shape = 'circle',
  status,
  className = ''
}) => {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const avatarClass = [
    'atlas-avatar',
    `atlas-avatar--${size}`,
    `atlas-avatar--${shape}`,
    status && 'atlas-avatar--with-status',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={avatarClass}>
      <div className="atlas-avatar__container">
        {src ? (
          <img
            className="atlas-avatar__image"
            src={src}
            alt={alt || name || 'Avatar'}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : name ? (
          <span className="atlas-avatar__initials">{getInitials(name)}</span>
        ) : (
          <svg
            className="atlas-avatar__icon"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        )}
      </div>

      {status && (
        <span
          className={`atlas-avatar__status atlas-avatar__status--${status}`}
          aria-label={status}
        />
      )}
    </div>
  );
};

/**
 * AvatarGroup component for multiple avatars
 */
export interface AvatarGroupProps {
  /** Maximum avatars to show */
  max?: number;
  /** Size for all avatars */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Children avatars */
  children: React.ReactNode;
  /** Custom class name */
  className?: string;
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  max = 5,
  size = 'md',
  children,
  className = ''
}) => {
  const childrenArray = React.Children.toArray(children);
  const visibleChildren = childrenArray.slice(0, max);
  const remainingCount = childrenArray.length - max;

  const groupClass = [
    'atlas-avatar-group',
    `atlas-avatar-group--${size}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={groupClass}>
      {visibleChildren.map((child, index) =>
        React.cloneElement(child as React.ReactElement, {
          key: index,
          size
        })
      )}
      {remainingCount > 0 && (
        <div className={`atlas-avatar atlas-avatar--${size} atlas-avatar--circle atlas-avatar--overflow`}>
          <span className="atlas-avatar__initials">+{remainingCount}</span>
        </div>
      )}
    </div>
  );
};

export default Avatar;
